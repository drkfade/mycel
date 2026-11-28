#!/bin/sh
# Removes /usr/local/bin/mycel, /usr/local/bin/myc, /usr/local/bin/ply and support files.
set -eu
case "${1-}" in
  --dry-run) printf '%s\n' 'Would remove /usr/local/bin/mycel, /usr/local/bin/myc, /usr/local/bin/ply and the four Mycel support files; forget xyz.ol1x.mycel.pkg. User projects/cache are retained.'; exit 0 ;;
  '') ;;
  *) printf '%s\n' 'usage: uninstall.sh [--dry-run]' >&2; exit 2 ;;
esac
if [ "$(/usr/bin/id -u)" != 0 ]; then
  printf '%s\n' 'Run: sudo /bin/sh /usr/local/share/mycel/uninstall.sh' >&2
  exit 1
fi
/bin/rm -f /usr/local/bin/mycel /usr/local/bin/myc /usr/local/bin/ply \
  /usr/local/share/mycel/LICENSE.txt /usr/local/share/mycel/README.txt \
  /usr/local/share/mycel/NODE-LICENSE.txt /usr/local/share/mycel/uninstall.sh
/bin/rmdir /usr/local/share/mycel 2>/dev/null || :
/usr/sbin/pkgutil --forget xyz.ol1x.mycel.pkg
printf '%s\n' 'Mycel removed. Your projects and package cache were retained.'
