using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Orbit camera for the salaryman. Right stick or mouse to look, with collision so it pulls
    /// in rather than clipping through a hillside, and a first person toggle on Y or V.
    /// </summary>
    [AddComponentMenu("SalaryMan/Konto Third Person Camera")]
    public class KontoThirdPersonCamera : MonoBehaviour
    {
        [Header("Target")]
        [Tooltip("What the camera orbits. Usually an empty at shoulder height on the character.")]
        public Transform target;
        [Tooltip("Offset from the target, in the target's own space. Y raises the pivot, X gives an over-the-shoulder framing.")]
        public Vector3 pivotOffset = new Vector3(0.35f, 1.55f, 0f);

        [Header("Distance")]
        public float distance = 4.2f;
        public float minDistance = 1.2f;
        public float maxDistance = 8f;
        [Tooltip("How fast the camera returns to its distance after an obstacle stops blocking it.")]
        public float distanceSmoothing = 8f;

        [Header("Look")]
        [Tooltip("Mouse sensitivity, in degrees per unit of mouse movement.")]
        public float mouseSensitivity = 2.2f;
        [Tooltip("Stick sensitivity multiplier, applied on top of the base turn rate.")]
        public float stickSensitivity = 1.0f;
        public bool invertY = false;
        public float minPitch = -55f;
        public float maxPitch = 72f;
        [Tooltip("Smoothing on the rotation itself. Zero is raw and precise, higher is cinematic.")]
        [Range(0f, 0.25f)] public float rotationSmoothing = 0.04f;

        [Header("Collision")]
        [Tooltip("What the camera is not allowed to pass through. Leave the player's own layer out of this.")]
        public LayerMask collisionLayers = ~0;
        [Tooltip("Radius of the sphere swept back from the pivot. Should exceed the camera's near clip.")]
        public float collisionRadius = 0.28f;
        [Tooltip("Gap kept between the camera and whatever it hit.")]
        public float collisionBuffer = 0.18f;

        [Header("Feel")]
        [Tooltip("Extra field of view while sprinting. A little goes a long way.")]
        public float sprintFovBoost = 6f;
        public float baseFov = 60f;
        public float fovSmoothing = 4f;

        [Header("First person")]
        public bool allowFirstPerson = true;
        [Tooltip("Where the eyes are, in the target's space, when in first person.")]
        public Vector3 firstPersonOffset = new Vector3(0f, 1.66f, 0.12f);

        [Header("Cursor")]
        public bool lockCursor = true;

        float _yaw;
        float _pitch;
        float _currentDistance;
        float _yawVelocity;
        float _pitchVelocity;
        float _smoothYaw;
        float _smoothPitch;
        bool _firstPerson;
        Camera _camera;
        KontoCharacter _character;

        public bool IsFirstPerson { get { return _firstPerson; } }

        void Start()
        {
            _camera = GetComponent<Camera>();
            if (_camera == null) _camera = GetComponentInChildren<Camera>();
            if (_camera != null) baseFov = _camera.fieldOfView;

            if (target != null) _character = target.GetComponentInParent<KontoCharacter>();

            Vector3 angles = transform.eulerAngles;
            _yaw = _smoothYaw = angles.y;
            _pitch = _smoothPitch = angles.x > 180f ? angles.x - 360f : angles.x;
            _currentDistance = distance;

            ApplyCursorLock(lockCursor);
        }

        void OnEnable()
        {
            if (Application.isPlaying) ApplyCursorLock(lockCursor);
        }

        void LateUpdate()
        {
            if (target == null) return;

            if (KontoInput.MenuPressed)
            {
                lockCursor = !lockCursor;
                ApplyCursorLock(lockCursor);
            }

            if (allowFirstPerson && KontoInput.ToggleViewPressed) _firstPerson = !_firstPerson;

            ReadLook();
            PositionCamera();
            UpdateFov();
        }

        void ReadLook()
        {
            // Sticks report deflection, the mouse reports movement, so only one of them needs
            // the frame time applied. KontoInput.LookScaled handles that distinction.
            float sensitivity = KontoInput.LookIsAnalog ? stickSensitivity : mouseSensitivity;
            Vector2 look = KontoInput.LookScaled(sensitivity);

            _yaw += look.x;
            _pitch += invertY ? look.y : -look.y;
            _pitch = Mathf.Clamp(_pitch, minPitch, maxPitch);

            if (rotationSmoothing > 0.001f)
            {
                _smoothYaw = Mathf.SmoothDampAngle(_smoothYaw, _yaw, ref _yawVelocity, rotationSmoothing);
                _smoothPitch = Mathf.SmoothDamp(_smoothPitch, _pitch, ref _pitchVelocity, rotationSmoothing);
            }
            else
            {
                _smoothYaw = _yaw;
                _smoothPitch = _pitch;
            }
        }

        void PositionCamera()
        {
            Quaternion rotation = Quaternion.Euler(_smoothPitch, _smoothYaw, 0f);

            if (_firstPerson)
            {
                transform.position = target.TransformPoint(firstPersonOffset);
                transform.rotation = rotation;
                _currentDistance = 0f;
                return;
            }

            Vector3 pivot = target.position + target.up * pivotOffset.y + rotation * new Vector3(pivotOffset.x, 0f, pivotOffset.z);
            Vector3 wanted = pivot - rotation * Vector3.forward * distance;

            // Sweep back from the pivot so the camera stops at the first thing in the way
            // instead of ending up inside a hillside.
            float allowed = distance;
            RaycastHit hit;
            Vector3 direction = (wanted - pivot).normalized;
            if (Physics.SphereCast(pivot, collisionRadius, direction, out hit, distance, collisionLayers, QueryTriggerInteraction.Ignore))
            {
                allowed = Mathf.Max(minDistance, hit.distance - collisionBuffer);
            }

            // Snap in when blocked, ease out when clear: the reverse looks like the camera is
            // lagging through geometry.
            if (allowed < _currentDistance) _currentDistance = allowed;
            else _currentDistance = Mathf.Lerp(_currentDistance, allowed, 1f - Mathf.Exp(-distanceSmoothing * Time.deltaTime));

            transform.position = pivot - rotation * Vector3.forward * _currentDistance;
            transform.rotation = rotation;
        }

        void UpdateFov()
        {
            if (_camera == null) return;
            bool sprinting = _character != null && _character.IsSprinting;
            float targetFov = baseFov + (sprinting ? sprintFovBoost : 0f);
            _camera.fieldOfView = Mathf.Lerp(_camera.fieldOfView, targetFov, 1f - Mathf.Exp(-fovSmoothing * Time.deltaTime));
        }

        void ApplyCursorLock(bool locked)
        {
            if (!Application.isPlaying) return;
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }

        /// <summary>Points the camera at a compass bearing without a sweep. Use after teleporting.</summary>
        public void SnapTo(float yawDegrees, float pitchDegrees)
        {
            _yaw = _smoothYaw = yawDegrees;
            _pitch = _smoothPitch = Mathf.Clamp(pitchDegrees, minPitch, maxPitch);
            _yawVelocity = 0f;
            _pitchVelocity = 0f;
        }
    }
}
