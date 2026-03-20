import subprocess
import sys
import os

if __name__ == "__main__":
    env = os.environ.copy()
    env["NODE_ENV"] = "production"
    result = subprocess.run(
        ["npm", "run", "start"],
        env=env,
        cwd=os.path.dirname(os.path.abspath(__file__)) or "."
    )
    sys.exit(result.returncode)
