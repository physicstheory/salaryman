using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// A plain character controller for walking the terrain at human scale. This is not the
    /// game's player controller; it is here so the world can be judged from eye height, which
    /// is the only way to tell whether the slopes, the scale and the detail actually work.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    [AddComponentMenu("SalaryMan/Konto Walker")]
    public class KontoWalker : MonoBehaviour
    {
        [Header("Movement")]
        public float walkSpeed = 2.2f;      // an unhurried salaryman
        public float runSpeed = 5.6f;
        public float acceleration = 12f;
        public float jumpHeight = 1.1f;
        public float gravity = -19.6f;      // exaggerated, it reads better than true gravity

        [Header("Look")]
        public Transform cameraPivot;
        public float lookSensitivity = 2.4f;
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
            if (lockCursor && Application.isPlaying)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        void Update()
        {
            Vector2 look = KontoInput.Look * lookSensitivity;
            _yaw += look.x;
            _pitch = Mathf.Clamp(_pitch - look.y, -85f, 85f);
            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
            if (cameraPivot != null) cameraPivot.localRotation = Quaternion.Euler(_pitch, 0f, 0f);

            Vector2 move = KontoInput.Move;
            Vector3 wish = (transform.right * move.x + transform.forward * move.y);
            if (wish.sqrMagnitude > 1f) wish.Normalize();

            float speed = KontoInput.Sprint ? runSpeed : walkSpeed;
            _horizontalVelocity = Vector3.Lerp(_horizontalVelocity, wish * speed, Time.deltaTime * acceleration);

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
    }
}
