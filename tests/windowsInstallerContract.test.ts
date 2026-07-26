import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const repoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const installerInclude = repoFile('scripts/nsis-installer.nsh');
const installSection = repoFile(
  'node_modules/app-builder-lib/templates/nsis/installSection.nsh',
);
const extractTemplate = repoFile(
  'node_modules/app-builder-lib/templates/nsis/include/extractAppPackage.nsh',
);
const installerTemplate = repoFile(
  'node_modules/app-builder-lib/templates/nsis/include/installer.nsh',
);
const rootInstallerTemplate = repoFile(
  'node_modules/app-builder-lib/templates/nsis/installer.nsi',
);
const webPackageTemplate = repoFile(
  'node_modules/app-builder-lib/templates/nsis/include/webPackage.nsh',
);
const appBuilderPatch = repoFile('patches/app-builder-lib+24.13.3.patch');

describe('Windows installer hardening contracts', () => {
  test('releases the installer current-directory lock before the update rename', () => {
    const switchOutPath = installerInclude.indexOf('SetOutPath "$PLUGINSDIR"');
    const rename = installerInclude.indexOf(
      'MoveFileW(w "$WULUOldInstallOriginalPath", w "$WULUOldInstallBackupPath")',
    );

    expect(switchOutPath).toBeGreaterThan(-1);
    expect(rename).toBeGreaterThan(switchOutPath);
    expect(installerInclude).toContain('${IfNot} ${isUpdated}');
    expect(installerInclude).toContain('"install-location-mismatch"');
    expect(installerInclude).toContain('"ambiguous-dual-registration"');
    expect(installerInclude).toContain('phase=old-install-rename-attempt');
    expect(installerInclude).toContain('phase=old-install-rename-complete status=');
    expect(installerInclude).not.toContain('phase=old-install-cleanup-complete');
  });

  test('captures shortcut state before rename and explicitly controls old uninstallers', () => {
    const shortcutProbe = installSection.indexOf('Var /GLOBAL keepShortcuts');
    const checkAppRunning = installSection.indexOf('!insertmacro CHECK_APP_RUNNING');
    const oldUninstaller = installSection.indexOf(
      '!insertmacro customUninstallOldVersion SHELL_CONTEXT',
    );
    const postUninstallHook = installSection.indexOf(
      '!insertmacro customAfterUninstallOldVersions',
    );
    const installFiles = installSection.indexOf('!insertmacro installApplicationFiles');

    expect(shortcutProbe).toBeGreaterThan(-1);
    expect(shortcutProbe).toBeLessThan(checkAppRunning);
    expect(oldUninstaller).toBeGreaterThan(checkAppRunning);
    expect(postUninstallHook).toBeGreaterThan(oldUninstaller);
    expect(postUninstallHook).toBeLessThan(installFiles);
    expect(installerInclude).toContain('phase=old-uninstaller-skipped');
    expect(installerInclude).toContain('phase=old-uninstaller-start');
    expect(installerInclude).toContain('phase=old-uninstaller-returned');
    expect(installerInclude).toContain('phase=old-uninstaller-complete');
  });

  test('applies and verifies Defender exclusion only after legacy uninstallers', () => {
    expect(installerInclude).toContain('!macro customAfterUninstallOldVersions');
    expect(installerInclude).toContain('point=post-old-uninstaller');
    expect(installerInclude).toContain(String.raw`$$target = \"$INSTDIR\";`);
    expect(installerInclude).toContain('before_count=');
    expect(installerInclude).toContain('remove=');
    expect(installerInclude).toContain('after_count=');
    expect(installerInclude).toContain('Remove-MpPreference -ExclusionPath $$targets');
    expect(installerInclude).toContain('phase=old-install-cleanup-scheduled');
    expect(installerInclude).toContain(
      '${If} $WULUOldInstallRenameStatus == "committed"',
    );
    expect(installerInclude).toContain('target=exact-current-backup');
    expect(installerInclude).not.toContain('target_pattern=$INSTDIR.old');
    expect(installerInclude.indexOf('phase=old-install-cleanup-scheduled')).toBeGreaterThan(
      installerInclude.indexOf('phase=defender-exclusion-permanent-complete'),
    );
  });

  test('splits embedded package extraction, copying, cache, and size phases', () => {
    expect(extractTemplate).toContain('customAppPackageMaterializeStart');
    expect(extractTemplate).toContain('customAppPackageMaterializeEnd');
    expect(extractTemplate).toContain('customAppPackageExtractStart "staging" "${FILE}"');
    expect(extractTemplate).toContain('customAppPackageExtractEnd "staging" "unchecked"');
    expect(extractTemplate).toContain('customAppPackageCopyStart');
    expect(extractTemplate).toContain('customAppPackageCopyEnd "success"');
    expect(extractTemplate).toContain('customAppPackageCopyEnd "error"');
    expect(installerTemplate).toContain('customInstallerCacheCopyStart "installer"');
    expect(installerTemplate).toContain('customInstallerCacheCopyEnd "installer" "success"');
    expect(installerTemplate).toContain('customEstimatedSizeKnown');
    expect(installerTemplate).toContain('customEstimatedSizeScanStart');
    expect(installerTemplate).toContain('customEstimatedSizeScanEnd "$0"');

    const copyStart = extractTemplate.indexOf('customAppPackageCopyStart');
    const clearErrors = extractTemplate.indexOf('ClearErrors', copyStart);
    const copyFiles = extractTemplate.indexOf('CopyFiles /SILENT', copyStart);
    const copyErrorCheck = extractTemplate.indexOf('IfErrors CopyExtract7zaFailed', copyStart);
    expect(clearErrors).toBeGreaterThan(copyStart);
    expect(clearErrors).toBeLessThan(copyFiles);
    expect(copyFiles).toBeLessThan(copyErrorCheck);
  });

  test('rolls a renamed installation back before every controlled failure exit', () => {
    expect(installerInclude).toContain('Function WULURollbackOldInstall');
    expect(installerInclude).toContain('phase=old-install-rollback-start');
    expect(installerInclude).toContain('phase=old-install-rollback-complete');
    expect(installerInclude).toContain('phase=old-install-commit-complete');
    expect(installerInclude).toContain('phase=skill-backup-failed-abort');
    expect(installerInclude).toContain('phase=skill-restore-failed');
    expect(installerInclude).toContain(
      'StrCmp $WULUOldInstallRollbackStatus "success"',
    );
    expect(installerInclude).toContain('!macro customBeforeInstallerQuit REASON');
    expect(rootInstallerTemplate).toContain('!define MUI_CUSTOMFUNCTION_ABORT');
    expect(rootInstallerTemplate).toContain('Function .onInstFailed');
    expect(extractTemplate).toContain(
      '!insertmacro customBeforeInstallerQuit "payload-copy-aborted"',
    );
    expect(webPackageTemplate).toContain(
      '!insertmacro customBeforeInstallerQuit "web-package-download-cancelled"',
    );

    const commit = installerInclude.indexOf('phase=old-install-commit-complete');
    const cleanup = installerInclude.indexOf('phase=old-install-cleanup-scheduled');
    expect(commit).toBeGreaterThan(-1);
    expect(cleanup).toBeGreaterThan(commit);
  });

  test('persists every template hook in the version-pinned patch', () => {
    expect(appBuilderPatch).toContain('templates/nsis/installSection.nsh');
    expect(appBuilderPatch).toContain('templates/nsis/installer.nsi');
    expect(appBuilderPatch).toContain('templates/nsis/include/extractAppPackage.nsh');
    expect(appBuilderPatch).toContain('templates/nsis/include/installer.nsh');
    expect(appBuilderPatch).toContain('templates/nsis/include/webPackage.nsh');
    expect(appBuilderPatch).toContain('customAfterUninstallOldVersions');
    expect(appBuilderPatch).toContain('customAppPackageExtractStart');
    expect(appBuilderPatch).toContain('customInstallerCacheCopyStart');

    // Preserve the existing explicit web-package URL behavior while updating
    // the larger patch file.
    expect(appBuilderPatch).toContain('Computed URLs point at a directory');
    expect(appBuilderPatch).toContain('defines.APP_PACKAGE_URL_IS_INCOMPLETE = null;');
  });
});
