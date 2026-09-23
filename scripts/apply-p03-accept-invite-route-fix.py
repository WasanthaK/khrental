from pathlib import Path

routes = Path('src/routes.jsx')
text = routes.read_text()
old = "      { path: 'accept-invite', element: <PublicRoute><AcceptInvite /></PublicRoute> },"
new = "      { path: 'accept-invite', element: <AcceptInvite /> },"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('accept-invite route anchor not found')
routes.write_text(text)

tests = Path('tests/invitation-lifecycle-ui.test.js')
source = tests.read_text()
import_anchor = "const badgeSource = readFileSync(new URL('../src/components/common/InvitationStatusBadge.jsx', import.meta.url), 'utf8');\n"
import_add = import_anchor + "const routesSource = readFileSync(new URL('../src/routes.jsx', import.meta.url), 'utf8');\n"
if "const routesSource =" not in source:
    if import_anchor not in source:
        raise SystemExit('test import anchor not found')
    source = source.replace(import_anchor, import_add, 1)

test_block = """

test('secure invitation redemption is not swallowed by an existing authenticated browser session', () => {
  assert.match(routesSource, /path: 'accept-invite', element: <AcceptInvite \/>/);
  assert.doesNotMatch(routesSource, /path: 'accept-invite', element: <PublicRoute><AcceptInvite \/><\/PublicRoute>/);
});
"""
if "secure invitation redemption is not swallowed" not in source:
    source += test_block
tests.write_text(source)
