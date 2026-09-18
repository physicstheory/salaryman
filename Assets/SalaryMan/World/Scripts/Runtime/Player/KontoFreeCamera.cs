using UnityEngine;

namespace SalaryMan.World
{
    /// <summary>
    /// Fly camera for looking the world over. Hold right mouse to look, WASD to move, Q and E
    /// for down and up, shift to sprint, scroll to change speed.
    /// </summary>
    [AddComponentMenu("SalaryMan/Konto Free Camera")]
    public class KontoFreeCamera : MonoBehaviour
    {
        public float moveSpeed = 40f;
        public float sprintMultiplier = 6f;
        public float lookSensitivity = 3f;
        public float smoothing = 12f;

        Vector3 _velocity;
        float _yaw;
        float _pitch;

        void Start()
        {
            Vector3 e = transform.eulerAngles;
            _yaw = e.y;
            _pitch = e.x;
        }

        void Update()
        {
            if (KontoInput.RightMouseHeld)
            {
                Vector2 look = KontoInput.Look * lookSensitivity;
                _yaw += look.x;
                _pitch = Mathf.Clamp(_pitch - look.y, -89f, 89f);
                transform.rotation = Quaternion.Euler(_pitch, _yaw, 0f);
            }

            moveSpeed = Mathf.Clamp(moveSpeed * (1f + KontoInput.Scroll * 4f), 1f, 4000f);

            Vector2 move = KontoInput.Move;
            Vector3 target = transform.right * move.x + transform.forward * move.y;
            if (KontoInput.Rise) target += Vector3.up;
            if (KontoInput.Fall) target -= Vector3.up;

            float speed = moveSpeed * (KontoInput.Sprint ? sprintMultiplier : 1f);
            _velocity = Vector3.Lerp(_velocity, target.normalized * speed, Time.deltaTime * smoothing);
            transform.position += _velocity * Time.deltaTime;
        }
    }
}
