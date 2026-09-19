using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A plain first person controller for checking the terrain at human scale, with no model
    /// and no animation. For the actual character, use KontoCharacter with the third person
    /// camera; this is the quick way to judge whether slopes, scale and detail work from
    /// eye height, which is the only view that really tells you.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    [AddComponentMenu("SalaryMan/Konto Walker (first person test)")]
    public class KontoWalker : MonoBehaviour
    {
        [Header("Movement")]
        public float walkSpeed = 2.2f;
        public float runSpeed = 5.6f;
        public float acceleration = 12f;
        public float jumpHeight = 1.1f;
        public float gravity = -19.6f;

        [Header("Look")]
        public Transform cameraPivot;
        public float mouseSensitivity = 2.4f;
        public float stickSensitivity = 1f;
        public bool invertY = false;
        public bool lockCursor = true;

        CharacterController _controller;
        Vector3 _horizontalVelocity;
        float _verticalVelocity;
        float _yaw;
        float _pitch;

        void Awake()
        {
            _controller = GetComponent<CharacterController>();
            if (cameraPivot == null && Camera.main != null) cameraPivot = Camera.main.transform;
            _yaw = transform.eulerAngles.y;
        }

        void Start()
        {
            ApplyCursorLock(lockCursor);
        }

        void Update()
        {
            if (KontoInput.MenuPressed)
            {
                lockCursor = !lockCursor;
                ApplyCursorLock(lockCursor);
            }

            float sensitivity = KontoInput.LookIsAnalog ? stickSensitivity : mouseSensitivity;
            Vector2 look = KontoInput.LookScaled(sensitivity);
            _yaw += look.x;
            _pitch = Mathf.Clamp(_pitch + (invertY ? look.y : -look.y), -85f, 85f);
            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
            if (cameraPivot != null) cameraPivot.localRotation = Quaternion.Euler(_pitch, 0f, 0f);

            Vector2 move = KontoInput.Move;
            Vector3 wish = transform.right * move.x + transform.forward * move.y;
            if (wish.sqrMagnitude > 1f) wish.Normalize();

            float speed = KontoInput.Sprint ? runSpeed : walkSpeed;
            _horizontalVelocity = Vector3.Lerp(_horizontalVelocity, wish * speed, 1f - Mathf.Exp(-acceleration * Time.deltaTime));

            if (_controller.isGrounded)
            {
                if (_verticalVelocity < 0f) _verticalVelocity = -2f;
                if (KontoInput.JumpPressed) _verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
            }
            else
            {
                _verticalVelocity += gravity * Time.deltaTime;
            }

            Vector3 motion = _horizontalVelocity;
            motion.y = _verticalVelocity;
            _controller.Move(motion * Time.deltaTime);
        }

        void ApplyCursorLock(bool locked)
        {
            if (!Application.isPlaying) return;
            Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
            Cursor.visible = !locked;
        }
    }
}
