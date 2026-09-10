# Private runtime directory

No Python packages or model weights are distributed in the source ZIP.
`tools/bootstrap.py` creates a per-backend venv here and writes `<engine>.json` and a complete `<engine>.resolved.txt` lock.

A Python venv is not a universally relocatable application. Recreate it on the target platform from the lock and wheelhouse.
A truly portable Python build is a separate, OS/architecture-specific packaging task; it is not claimed to be included.
GPU execution still needs compatible system drivers. The Node CLI itself has no npm dependencies.
