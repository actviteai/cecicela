# Security Policy

## Supported versions

Only the latest release of each package receives security fixes: `@actvite/cecicela`, `@actvite/ceci`, `@actvite/cela`, and `@actvite/trouble`.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include the package, its version, the command you ran, and what happened. You will get a reply as soon as a maintainer can look at it.

## Scope

ceciCela is a set of local CLIs and agent skills with no network access and no third-party package dependencies. Reports we care about most:

- `cecicela install`, `ceci install`, `cela install`, `cela init`, or `trouble install` writing, replacing, or deleting files outside the paths they document.
- A crafted `state.md`, `brief.md`, `gpu-prefs.yaml`, `.cela/` file, or `voices.yaml` that makes a tool read or write outside its working directory.
- Anything in a published npm package that should not be there.

## Releases

CI holds no npm token and cannot publish. `npm run release` prepares and verifies the packages and writes `dist/release-plan.md`; a maintainer stages each package and publishes it by hand with npm two-factor authentication.
