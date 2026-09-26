"""Write the API's OpenAPI schema, which the frontend's TypeScript types are generated from.

Usage: python -m backend.export_openapi [output path]
"""

import json
import sys
from pathlib import Path

from backend.app import app

DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "frontend-next" / "openapi.json"


def main():
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    output.write_text(json.dumps(app.openapi(), indent=2) + "\n")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
