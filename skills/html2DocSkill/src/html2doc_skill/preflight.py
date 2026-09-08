from __future__ import annotations

import platform

from bs4 import __version__ as beautifulsoup_version
import cssselect2
import docx
import lxml
from PIL import __version__ as pillow_version
import tinycss2


def doctor() -> dict[str, object]:
    return {
        "ok": True,
        "python": platform.python_version(),
        "beautifulsoup": beautifulsoup_version,
        "cssselect2": getattr(cssselect2, "__version__", "available"),
        "lxml": lxml.__version__,
        "pillow": pillow_version,
        "pythonDocx": docx.__version__,
        "tinycss2": tinycss2.__version__,
        "remoteServices": False,
        "visualRenderer": False,
    }
