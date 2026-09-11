/**
 * Built-in shell commands for extracting version information from local tools.
 * Each key matches a tool ID from the PulseDock tool registry.
 */
export const BUILT_IN_CHECKS: Record<string, string> = {
  'proxmox-ve':
    'curl -sk https://localhost:8006/api2/json/version | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[\'data\'][\'version\'])"',
  'pfsense':
    "php -r \"require_once('/etc/inc/functions.inc'); echo g_get('product_version');\"",
  'opnsense':
    'cat /usr/local/opnsense/version/core | head -1',
  'unraid':
    'cat /etc/unraid-version 2>/dev/null | grep version | cut -d= -f2 | tr -d \'"\' ',
  'openwrt':
    "cat /etc/openwrt_release | grep DISTRIB_RELEASE | cut -d= -f2 | tr -d '\"'",
  'truenas-scale':
    'midclt call system.version 2>/dev/null || cat /etc/version 2>/dev/null',
  'truenas-core':
    'freenas-version 2>/dev/null || cat /etc/version 2>/dev/null',
  'vyos':
    "cat /opt/vyatta/etc/version 2>/dev/null | head -1 | awk '{print $2}'",
  'docker-engine':
    'docker version --format "{{.Server.Version}}" 2>/dev/null',
  'postgresql':
    "psql --version 2>/dev/null | awk '{print $3}'",
  'mysql':
    "mysql --version 2>/dev/null | awk '{print $5}' | tr -d ','",
  'mariadb':
    "mariadb --version 2>/dev/null | awk '{print $5}' | tr -d ','",
  'nginx':
    "nginx -v 2>&1 | awk -F/ '{print $2}'",
  'apache':
    "apache2 -v 2>/dev/null | head -1 | awk -F/ '{print $2}' | awk '{print $1}'",
  'openssh':
    "ssh -V 2>&1 | awk '{print $1}' | cut -d_ -f2",
};
