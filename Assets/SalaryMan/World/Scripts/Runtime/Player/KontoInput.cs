using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace SalaryMan.World
{
    /// <summary>
    /// One input surface for keyboard, mouse and Xbox pad, working under either of Unity's
    /// input backends. Unity defines ENABLE_INPUT_SYSTEM and ENABLE_LEGACY_INPUT_MANAGER from
    /// the Active Input Handling setting, so this compiles whichever you picked.
    ///
    /// The one thing callers must respect: <see cref="LookIsAnalog"/>. A mouse reports how far
    /// it moved this frame, so its look value is already a delta. A stick reports how far it is
    /// pushed, so its look value is a rate and has to be multiplied by Time.deltaTime. Getting
    /// that wrong gives you a camera that is either unusably fast or frame-rate dependent.
    /// </summary>
    public static class KontoInput
    {
        /// <summary>Radial dead zone for both sticks. Xbox pads rest a little off centre.</summary>
        public const float StickDeadZone = 0.18f;

        /// <summary>Degrees per second at full right stick deflection, before sensitivity.</summary>
        public const float StickLookRate = 220f;

        /// <summary>True when the most recent look input came from a stick rather than the mouse.</summary>
        public static bool LookIsAnalog { get; private set; }

        // ---------------------------------------------------------------- movement

        /// <summary>Movement intent. X is strafe, Y is forward. Magnitude never exceeds 1.</summary>
        public static Vector2 Move
        {
            get
            {
                Vector2 keyboard = Vector2.zero;
                Vector2 stick = Vector2.zero;

#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (kb != null)
                {
                    keyboard.x = (kb.dKey.isPressed ? 1f : 0f) - (kb.aKey.isPressed ? 1f : 0f);
                    keyboard.y = (kb.wKey.isPressed ? 1f : 0f) - (kb.sKey.isPressed ? 1f : 0f);
                }
                var pad = Gamepad.current;
                if (pad != null) stick = ApplyDeadZone(pad.leftStick.ReadValue());
#elif ENABLE_LEGACY_INPUT_MANAGER
                keyboard.x = (Input.GetKey(KeyCode.D) ? 1f : 0f) - (Input.GetKey(KeyCode.A) ? 1f : 0f);
                keyboard.y = (Input.GetKey(KeyCode.W) ? 1f : 0f) - (Input.GetKey(KeyCode.S) ? 1f : 0f);
                // Unity's default Horizontal/Vertical axes already include joystick axes 1 and 2.
                stick = ApplyDeadZone(new Vector2(SafeAxis("Horizontal"), SafeAxis("Vertical")));
#endif
                Vector2 combined = stick.sqrMagnitude > keyboard.sqrMagnitude ? stick : keyboard;
                return combined.sqrMagnitude > 1f ? combined.normalized : combined;
            }
        }

        // ---------------------------------------------------------------- look

        /// <summary>
        /// Look intent. Multiply by your sensitivity, and also by Time.deltaTime when
        /// <see cref="LookIsAnalog"/> is true.
        /// </summary>
        public static Vector2 Look
        {
            get
            {
                Vector2 stick = Vector2.zero;
                Vector2 mouse = Vector2.zero;

#if ENABLE_INPUT_SYSTEM
                var pad = Gamepad.current;
                if (pad != null) stick = ApplyDeadZone(pad.rightStick.ReadValue());
                var mouseDevice = Mouse.current;
                if (mouseDevice != null) mouse = mouseDevice.delta.ReadValue() * 0.05f;
#elif ENABLE_LEGACY_INPUT_MANAGER
                stick = ApplyDeadZone(new Vector2(SafeAxis("Konto Look X"), SafeAxis("Konto Look Y")));
                mouse = new Vector2(SafeAxis("Mouse X"), SafeAxis("Mouse Y"));
#endif
                if (stick.sqrMagnitude > 0.0001f)
                {
                    LookIsAnalog = true;
                    // A gentle curve gives fine control near centre and speed at full push.
                    float magnitude = Mathf.Pow(Mathf.Clamp01(stick.magnitude), 1.7f);
                    return stick.normalized * magnitude * StickLookRate;
                }

                LookIsAnalog = false;
                return mouse;
            }
        }

        /// <summary>Applies sensitivity and, for stick input, the frame time. Use this unless you need the raw value.</summary>
        public static Vector2 LookScaled(float sensitivity)
        {
            Vector2 look = Look * sensitivity;
            return LookIsAnalog ? look * Time.deltaTime : look;
        }

        // ---------------------------------------------------------------- buttons

        /// <summary>Left stick click, or left shift.</summary>
        public static bool Sprint
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (kb != null && kb.leftShiftKey.isPressed) return true;
                var pad = Gamepad.current;
                return pad != null && (pad.leftStickButton.isPressed || pad.leftShoulder.isPressed);
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKey(KeyCode.LeftShift)
                    || Input.GetKey(KeyCode.JoystickButton8)      // left stick click
                    || Input.GetKey(KeyCode.JoystickButton4);     // left bumper
#else
                return false;
#endif
            }
        }

        /// <summary>A button, or space.</summary>
        public static bool JumpPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (kb != null && kb.spaceKey.wasPressedThisFrame) return true;
                var pad = Gamepad.current;
                return pad != null && pad.buttonSouth.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.JoystickButton0);
#else
                return false;
#endif
            }
        }

        /// <summary>B button, or left control. Held, not tapped.</summary>
        public static bool Crouch
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (kb != null && kb.leftCtrlKey.isPressed) return true;
                var pad = Gamepad.current;
                return pad != null && pad.buttonEast.isPressed;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.JoystickButton1);
#else
                return false;
#endif
            }
        }

        /// <summary>Y button, or V. Switches between third and first person.</summary>
        public static bool ToggleViewPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (kb != null && kb.vKey.wasPressedThisFrame) return true;
                var pad = Gamepad.current;
                return pad != null && pad.buttonNorth.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKeyDown(KeyCode.V) || Input.GetKeyDown(KeyCode.JoystickButton3);
#else
                return false;
#endif
            }
        }

        /// <summary>Start button, or escape. Frees the cursor.</summary>
        public static bool MenuPressed
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (kb != null && kb.escapeKey.wasPressedThisFrame) return true;
                var pad = Gamepad.current;
                return pad != null && pad.startButton.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
                return Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.JoystickButton7);
#else
                return false;
#endif
            }
        }

        // ---------------------------------------------------------------- fly camera

        /// <summary>Vertical fly input. Q and E, or the triggers: right rises, left descends.</summary>
        public static float Elevate
        {
            get
            {
                float value = 0f;
#if ENABLE_INPUT_SYSTEM
                var kb = Keyboard.current;
                if (kb != null)
                {
                    if (kb.eKey.isPressed) value += 1f;
                    if (kb.qKey.isPressed) value -= 1f;
                }
                var pad = Gamepad.current;
                if (pad != null) value += pad.rightTrigger.ReadValue() - pad.leftTrigger.ReadValue();
#elif ENABLE_LEGACY_INPUT_MANAGER
                if (Input.GetKey(KeyCode.E)) value += 1f;
                if (Input.GetKey(KeyCode.Q)) value -= 1f;
                // On Windows both Xbox triggers share one axis: right is positive, left negative.
                value += SafeAxis("Konto Triggers");
#endif
                return Mathf.Clamp(value, -1f, 1f);
            }
        }

        /// <summary>Speed adjustment. Mouse wheel, or the D-pad up and down.</summary>
        public static float SpeedAdjust
        {
            get
            {
                float value = 0f;
#if ENABLE_INPUT_SYSTEM
                var mouseDevice = Mouse.current;
                if (mouseDevice != null) value += mouseDevice.scroll.ReadValue().y * 0.01f;
                var pad = Gamepad.current;
                if (pad != null)
                {
                    if (pad.dpad.up.isPressed) value += Time.deltaTime * 2f;
                    if (pad.dpad.down.isPressed) value -= Time.deltaTime * 2f;
                }
#elif ENABLE_LEGACY_INPUT_MANAGER
                value += SafeAxis("Mouse ScrollWheel");
                value += SafeAxis("Konto DPad Y") * Time.deltaTime * 2f;
#endif
                return value;
            }
        }

        /// <summary>Held to look with the mouse in the fly camera. Always true on a pad, which has a dedicated stick.</summary>
        public static bool FreeLookHeld
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                var pad = Gamepad.current;
                if (pad != null && ApplyDeadZone(pad.rightStick.ReadValue()) != Vector2.zero) return true;
                var mouseDevice = Mouse.current;
                return mouseDevice != null && mouseDevice.rightButton.isPressed;
#elif ENABLE_LEGACY_INPUT_MANAGER
                if (ApplyDeadZone(new Vector2(SafeAxis("Konto Look X"), SafeAxis("Konto Look Y"))) != Vector2.zero) return true;
                return Input.GetMouseButton(1);
#else
                return false;
#endif
            }
        }

        // ---------------------------------------------------------------- devices

        public static bool GamepadPresent
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return Gamepad.current != null;
#elif ENABLE_LEGACY_INPUT_MANAGER
                string[] names = Input.GetJoystickNames();
                foreach (string n in names) if (!string.IsNullOrEmpty(n)) return true;
                return false;
#else
                return false;
#endif
            }
        }

        // ---------------------------------------------------------------- helpers

        /// <summary>
        /// Radial dead zone, rescaled so the usable range still starts at zero. Treating each
        /// axis separately, which is the common mistake, makes diagonals feel notched.
        /// </summary>
        static Vector2 ApplyDeadZone(Vector2 raw)
        {
            float magnitude = raw.magnitude;
            if (magnitude < StickDeadZone) return Vector2.zero;
            float scaled = Mathf.Clamp01((magnitude - StickDeadZone) / (1f - StickDeadZone));
            return raw / magnitude * scaled;
        }

#if ENABLE_LEGACY_INPUT_MANAGER && !ENABLE_INPUT_SYSTEM
        static readonly System.Collections.Generic.HashSet<string> MissingAxes = new System.Collections.Generic.HashSet<string>();

        /// <summary>
        /// Input.GetAxis throws if the axis is not configured, which would spam the console every
        /// frame. Each missing axis is reported once and then treated as zero.
        /// </summary>
        static float SafeAxis(string axisName)
        {
            if (MissingAxes.Contains(axisName)) return 0f;
            try
            {
                return Input.GetAxis(axisName);
            }
            catch (System.ArgumentException)
            {
                MissingAxes.Add(axisName);
                Debug.LogWarning("[Konto] Input axis '" + axisName + "' is not set up. Run "
                    + "Tools > SalaryMan > Install Gamepad Axes to add the Xbox pad axes to the legacy Input Manager.");
                return 0f;
            }
        }
#endif
    }
}
