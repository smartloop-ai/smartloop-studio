Title: Publisher display name change for smartloop-studio (smartloop)

| Field | Value |
| --- | --- |
| Snap name | smartloop-studio |
| Publisher username | smartloop |
| Account ID | DDU01zXqlhCL33EBh4n67NcFtjGadrKp |
| Current display name | Mehfuz Hossain |
| Requested display name | Smartloop Inc |
| Contact | support@smartloop.ai |
| Validation status | unproven |

Hi, I'd like to request a change to the publisher display name for the
`smartloop-studio` snap.

I have already updated the full name on the associated Ubuntu One SSO account
at login.ubuntu.com. The change has not propagated to the store: after a full
`snapcraft logout` / `snapcraft login` cycle and a complete SSO logout and
re-login at dashboard.snapcraft.io, the store still returns the old name.

Confirmed against the store API directly (uncached, cache-busted request):

    $ curl -s -H 'Snap-Device-Series: 16' \
        'https://api.snapcraft.io/v2/snaps/info/smartloop-studio?fields=publisher'

    "publisher": {
      "display-name": "Mehfuz Hossain",
      "id": "DDU01zXqlhCL33EBh4n67NcFtjGadrKp",
      "username": "smartloop",
      "validation": "unproven"
    }

The response carried no `age` or `cache-control` headers and a uniquely
cache-busted URL returned the same value, so this appears to be the stored
account record rather than a caching artifact.

The snap is published under the company name Smartloop Inc, and the personal
name currently shown on the listing does not match the publisher of record.
Could the display name be updated to `Smartloop Inc`?

Thanks.
