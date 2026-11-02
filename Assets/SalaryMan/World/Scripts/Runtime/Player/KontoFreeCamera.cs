using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Fly camera for looking the world over.
    ///
    /// Mouse and keyboard: hold right mouse to look, WASD to move, Q and E down and up, shift to
    /// sprint, scroll to change speed.
    /// Xbox pad: left stick to move, right stick to look, triggers for down and up, left stick
    /// click to sprint, D-pad up and down to change speed.
    /// </summary>
    [AddComponentMenu("SalaryMan/Konto Free Camera")]
    public class KontoFreeCamera : MonoBehaviour
    {
        public float moveSpeed = 40f;
        public float sprintMultiplier = 6f;
        [Tooltip("Mouse sensitivity, in degrees per unit of movement.")]
        public float mouseSensitivity = 2.2f;
        [Tooltip("Stick sensitivity multiplier.")]
        public float stickSensitivity = 1f;
        public float smoothing = 12f;
        public bool invertY = false;

        Vector3 _velocity;
        float _yaw;
        float _pitch;

        void Start()
        {
            Vector3 e = transform.eulerAngles;
            _yaw = e.y;
            _pitch = e.x > 180f ? e.x - 360f : e.x;
        }

        void Update()
        {
            if (KontoInput.FreeLookHeld)
            {
                float sensitivity = KontoInput.LookIsAnalog ? stickSensitivity : mouseSensitivity;
                Vector2 look = KontoInput.LookScaled(sensitivity);
                _yaw += look.x;
                _pitch = Mathf.Clamp(_pitch + (invertY ? look.y : -look.y), -89f, 89f);
                transform.rotation = Quaternion.Euler(_pitch, _yaw, 0f);
            }

            float adjust = KontoInput.SpeedAdjust;
            if (Mathf.Abs(adjust) > 0.0001f) moveSpeed = Mathf.Clamp(moveSpeed * (1f + adjust * 4f), 1f, 4000f);

            Vector2 move = KontoInput.Move;
            Vector3 target = transform.right * move.x + transform.forward * move.y + Vector3.up * KontoInput.Elevate;

            float speed = moveSpeed * (KontoInput.Sprint ? sprintMultiplier : 1f);
            _velocity = Vector3.Lerp(_velocity, Vector3.ClampMagnitude(target, 1f) * speed, 1f - Mathf.Exp(-smoothing * Time.deltaTime));
            transform.position += _velocity * Time.deltaTime;
        }
    }
}
