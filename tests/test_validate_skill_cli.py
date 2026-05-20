import subprocess
import sys
import unittest


class ValidateSkillCliTest(unittest.TestCase):
    def test_no_argument_mode_validates_all_builtin_skills(self) -> None:
        result = subprocess.run(
            [sys.executable, "scripts/validate_skill.py"],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("validated 5 skill file(s)", result.stdout)


if __name__ == "__main__":
    unittest.main()
