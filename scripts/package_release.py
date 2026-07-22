import gzip
import hashlib
import os
import shutil
import sys
import tarfile
import zipfile
from pathlib import Path


def files_under(root: Path):
    return sorted(path for path in root.rglob("*") if path.is_file())


def sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


version = sys.argv[1]
source = Path(sys.argv[2] if len(sys.argv) > 2 else ".").resolve()
output = Path(sys.argv[3] if len(sys.argv) > 3 else "artifact").resolve()
epoch = int(os.environ.get("SOURCE_DATE_EPOCH", "315532800"))
zip_time = tuple(__import__("time").gmtime(max(epoch, 315532800))[:6])

shutil.rmtree(output, ignore_errors=True)
output.mkdir(parents=True)
dist = source / "dist"
shutil.copy2(source / "LICENSE", dist / "LICENSE")

zip_path = output / f"glasspick-{version}.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files_under(dist):
        info = zipfile.ZipInfo(path.relative_to(dist).as_posix(), zip_time)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())

tar_path = output / f"glasspick-{version}.tar.gz"
with tar_path.open("wb") as raw:
    with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=epoch, compresslevel=9) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as archive:
            for path in files_under(dist):
                info = archive.gettarinfo(str(path), path.relative_to(dist).as_posix())
                info.mtime = epoch
                info.uid = info.gid = 0
                info.uname = info.gname = ""
                info.mode = 0o644
                with path.open("rb") as contents:
                    archive.addfile(info, contents)

checksums = output / "SHA256SUMS"
checksums.write_text(
    f"{sha256(zip_path)}  {zip_path.name}\n{sha256(tar_path)}  {tar_path.name}\n",
    encoding="ascii",
    newline="\n",
)
print(f"Packaged deterministic GlassPick {version} release")
