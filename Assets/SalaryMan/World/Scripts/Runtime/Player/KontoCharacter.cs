using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Third person character movement for the salaryman. Camera relative, so pushing the stick
    /// away from you always walks away from the camera, which is what every player expects.
    ///
    /// Animator parameters follow Unity's Starter Assets naming (Speed, Grounded, Jump,
    /// FreeFall, MotionSpeed), so most free or bought animation sets drop straight in. Every
    /// parameter is optional: whatever your controller does not have is simply not driven.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    [AddComponentMenu("SalaryMan/Konto Character")]
    public class KontoCharacter : MonoBehaviour
    {
        [Header("Speeds, in metres per second")]
        [Tooltip("An unhurried salaryman walk.")]
        public float walkSpeed = 1.6f;
        [Tooltip("Normal travel pace, used at full stick deflection.")]
        public float jogSpeed = 3.8f;
        [Tooltip("Sprint, held on left stick click or left shift.")]
        public float sprintSpeed = 6.4f;
        public float crouchSpeed = 1.1f;

        [Header("Feel")]
        [Tooltip("How quickly speed is reached and shed. Higher is snappier and less weighty.")]
        public float acceleration = 10f;
        [Tooltip("Degrees per second the body turns to face the direction of travel.")]
        public float turnSpeed = 720f;
        [Tooltip("Time in seconds to smooth the facing direction. Small values feel responsive, large ones feel heavy.")]
        [Range(0f, 0.3f)] public float turnSmoothing = 0.08f;

        [Header("Jump and gravity")]
        public float jumpHeight = 1.1f;
        [Tooltip("Exaggerated on purpose: true gravity feels floaty in a game.")]
        public float gravity = -20f;
        public float terminalVelocity = -55f;
        [Tooltip("Grace period after leaving the ground during which a jump still counts.")]
        public float coyoteTime = 0.14f;
        [Tooltip("Minimum time between jumps.")]
        public float jumpCooldown = 0.12f;

        [Header("Ground check")]
        [Tooltip("How far below the controller's base to look for ground.")]
        public float groundedOffset = 0.12f;
        public float groundedRadius = 0.28f;
        public LayerMask groundLayers = ~0;

        [Header("References")]
        [Tooltip("The camera the movement is relative to. Falls back to the main camera.")]
        public Transform cameraTransform;
        [Tooltip("The visual model. It is rotated to face the direction of travel; the collider is not.")]
        public Transform model;
        [Tooltip("Left empty, the animator is looked up on this object and its children.")]
        public Animator animator;

        [Header("State, read only")]
        [SerializeField] bool grounded;
        [SerializeField] float currentSpeed;

        CharacterController _controller;
        Vector3 _horizontalVelocity;
        float _verticalVelocity;
        float _timeSinceGrounded;
        float _jumpTimer;
        float _turnVelocity;
        float _targetYaw;

        // Animator parameters, resolved once and only used if the controller actually has them.
        int _hashSpeed, _hashGrounded, _hashJump, _hashFreeFall, _hashMotionSpeed;
        bool _hasSpeed, _hasGrounded, _hasJump, _hasFreeFall, _hasMotionSpeed;

        public bool IsGrounded { get { return grounded; } }
        /// <summary>Planar speed in metres per second.</summary>
        public float CurrentSpeed { get { return currentSpeed; } }
        public bool IsSprinting { get; private set; }

        void Awake()
        {
            _controller = GetComponent<CharacterController>();
            if (animator == null) animator = GetComponentInChildren<Animator>();
            if (model == null && animator != null) model = animator.transform;
            if (cameraTransform == null && Camera.main != null) cameraTransform = Camera.main.transform;
            _targetYaw = transform.eulerAngles.y;
            CacheAnimatorParameters();
        }

        void CacheAnimatorParameters()
        {
            _hashSpeed = Animator.StringToHash("Speed");
            _hashGrounded = Animator.StringToHash("Grounded");
            _hashJump = Animator.StringToHash("Jump");
            _hashFreeFall = Animator.StringToHash("FreeFall");
            _hashMotionSpeed = Animator.StringToHash("MotionSpeed");

            if (animator == null || animator.runtimeAnimatorController == null) return;
            foreach (var p in animator.parameters)
            {
                if (p.nameHash == _hashSpeed) _hasSpeed = true;
                else if (p.nameHash == _hashGrounded) _hasGrounded = true;
                else if (p.nameHash == _hashJump) _hasJump = true;
                else if (p.nameHash == _hashFreeFall) _hasFreeFall = true;
                else if (p.nameHash == _hashMotionSpeed) _hasMotionSpeed = true;
            }
        }

        void Update()
        {
            GroundCheck();
            Move();
            ApplyGravityAndJump();

            Vector3 motion = _horizontalVelocity;
            motion.y = _verticalVelocity;
            _controller.Move(motion * Time.deltaTime);

            DriveAnimator();
        }

        void GroundCheck()
        {
            Vector3 origin = transform.position + Vector3.up * (groundedRadius - groundedOffset);
            grounded = Physics.CheckSphere(origin, groundedRadius, groundLayers, QueryTriggerInteraction.Ignore);
            // The controller's own flag catches slopes the sphere check misses.
            if (_controller.isGrounded) grounded = true;

            if (grounded) _timeSinceGrounded = 0f;
            else _timeSinceGrounded += Time.deltaTime;
        }

        void Move()
        {
            Vector2 input = KontoInput.Move;
            IsSprinting = KontoInput.Sprint && input.sqrMagnitude > 0.1f;
            bool crouching = KontoInput.Crouch;

            // Partial stick deflection walks, full deflection jogs. Keyboard is always full.
            float magnitude = Mathf.Clamp01(input.magnitude);
            float targetSpeed;
            if (crouching) targetSpeed = crouchSpeed * magnitude;
            else if (IsSprinting) targetSpeed = sprintSpeed;
            else targetSpeed = Mathf.Lerp(walkSpeed, jogSpeed, Mathf.InverseLerp(0.15f, 1f, magnitude));

            if (magnitude < 0.01f) targetSpeed = 0f;

            Vector3 wishDirection = Vector3.zero;
            if (magnitude > 0.01f)
            {
                // Flatten the camera basis so looking up or down never changes where you walk.
                Vector3 forward = Vector3.forward;
                Vector3 right = Vector3.right;
                if (cameraTransform != null)
                {
                    forward = cameraTransform.forward;
                    right = cameraTransform.right;
                    forward.y = 0f;
                    right.y = 0f;
                    if (forward.sqrMagnitude < 1e-4f) forward = Vector3.forward;
                    forward.Normalize();
                    right.Normalize();
                }

                wishDirection = (right * input.x + forward * input.y).normalized;
                _targetYaw = Mathf.Atan2(wishDirection.x, wishDirection.z) * Mathf.Rad2Deg;
            }

            Vector3 target = wishDirection * targetSpeed;
            _horizontalVelocity = Vector3.Lerp(_horizontalVelocity, target, 1f - Mathf.Exp(-acceleration * Time.deltaTime));
            currentSpeed = new Vector2(_horizontalVelocity.x, _horizontalVelocity.z).magnitude;

            if (model != null && magnitude > 0.01f)
            {
                float yaw = Mathf.SmoothDampAngle(model.eulerAngles.y, _targetYaw, ref _turnVelocity, turnSmoothing, turnSpeed);
                model.rotation = Quaternion.Euler(0f, yaw, 0f);
            }
        }

        void ApplyGravityAndJump()
        {
            _jumpTimer -= Time.deltaTime;

            if (grounded && _verticalVelocity < 0f)
            {
                // A small downward bias keeps the controller pinned to slopes instead of
                // skipping down them, which is what causes the classic stair-step jitter.
                _verticalVelocity = -2f;
            }

            bool canJump = (grounded || _timeSinceGrounded <= coyoteTime) && _jumpTimer <= 0f;
            if (canJump && KontoInput.JumpPressed)
            {
                _verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
                _jumpTimer = jumpCooldown;
                _timeSinceGrounded = coyoteTime + 1f;
                if (_hasJump && animator != null) animator.SetTrigger(_hashJump);
            }

            if (_verticalVelocity > terminalVelocity) _verticalVelocity += gravity * Time.deltaTime;
        }

        void DriveAnimator()
        {
            if (animator == null || animator.runtimeAnimatorController == null) return;
            if (_hasSpeed) animator.SetFloat(_hashSpeed, currentSpeed, 0.08f, Time.deltaTime);
            if (_hasMotionSpeed) animator.SetFloat(_hashMotionSpeed, 1f);
            if (_hasGrounded) animator.SetBool(_hashGrounded, grounded);
            if (_hasFreeFall) animator.SetBool(_hashFreeFall, !grounded && _verticalVelocity < -2f);
        }

        /// <summary>Teleports the character, clearing momentum. Use this rather than setting transform.position.</summary>
        public void Warp(Vector3 position)
        {
            _controller.enabled = false;
            transform.position = position;
            _controller.enabled = true;
            _horizontalVelocity = Vector3.zero;
            _verticalVelocity = 0f;
        }

        void OnDrawGizmosSelected()
        {
            Gizmos.color = grounded ? new Color(0.3f, 0.9f, 0.4f, 0.4f) : new Color(0.9f, 0.4f, 0.3f, 0.4f);
            Gizmos.DrawSphere(transform.position + Vector3.up * (groundedRadius - groundedOffset), groundedRadius);
        }
    }
}
