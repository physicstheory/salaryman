using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace SalaryMan.World
{
    /// <summary>
    /// Minimal input abstraction so the test controllers work whether the project is set to the
    /// legacy Input Manager, the Input System package, or both. Unity defines these symbols for
    /// us based on the Active Input Handling setting in Player Settings.
    /// </summary>
    public static class KontoInput
    {
        public static Vector2 Move
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (kb != null)
                {
                    float x = (kb.dKey.isPressed ? 1f : 0f) - (kb.aKey.isPressed ? 1f : 0f);
                    float y = (kb.wKey.isPressed ? 1f : 0f) - (kb.sKey.isPressed ? 1f : 0f);
                    return new Vector2(x, y);
                }
                return Vector2.zero;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
#else
                return Vector2.zero;
#endif
            }
        }

        public static Vector2 Look
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var mouse = Mouse.current;
                return mouse != null ? mouse.delta.ReadValue() * 0.05f : Vector2.zero;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y"));
#else
                return Vector2.zero;
#endif
            }
        }

        public static float Scroll
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var mouse = Mouse.current;
                return mouse != null ? mouse.scroll.ReadValue().y * 0.01f : 0f;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetAxis("Mouse ScrollWheel");
#else
                return 0f;
#endif
            }
        }

        public static bool Sprint
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                return kb != null && kb.leftShiftKey.isPressed;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKey(KeyCode.LeftShift);
#else
                return false;
#endif
            }
        }

        public static bool JumpPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                return kb != null && kb.spaceKey.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKeyDown(KeyCode.Space);
#else
                return false;
#endif
            }
        }

        public static bool Rise
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                return kb != null && kb.eKey.isPressed;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKey(KeyCode.E);
#else
                return false;
#endif
            }
        }

        public static bool Fall
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                return kb != null && kb.qKey.isPressed;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKey(KeyCode.Q);
#else
                return false;
#endif
            }
        }

        public static bool RightMouseHeld
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var mouse = Mouse.current;
                return mouse != null && mouse.rightButton.isPressed;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetMouseButton(1);
#else
                return false;
#endif
            }
        }
    }
}
