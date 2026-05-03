export function buildRecommendation(report) {
  const summary = report.summary || {};
  const errors = summary.errors || 0;
  const warnings = summary.warnings || 0;

  if (report.mode === "post-upgrade") {
    if (errors > 0) {
      return {
        decision: "rollback-or-fix",
        label: "Do not trust this upgraded install yet",
        message: "Post-upgrade validation found hard errors. Fix them or roll back before relying on this OpenClaw install.",
      };
    }
    if (warnings > 0) {
      return {
        decision: "verify-before-trusting",
        label: "Verify warnings before trusting the upgrade",
        message: "No hard post-upgrade blockers were found, but warnings remain. Confirm they match known pre-upgrade state.",
      };
    }
    return {
      decision: "trust-upgrade",
      label: "Upgrade looks healthy",
      message: "Post-upgrade validation found no hard errors or warnings.",
    };
  }

  if ((report.mode === "baseline" || report.mode === "preflight") && errors > 0) {
    return {
      decision: "environment-not-ready",
      label: "Environment is not ready for upgrade validation",
      message:
        "The local host baseline failed before any target OpenClaw version was tested. Fix the current environment issues, then rerun the suite; this does not prove the target version failed.",
    };
  }

  if (errors > 0) {
    return {
      decision: "do-not-upgrade",
      label: "Do not upgrade yet",
      message: "This run found hard errors. Fix them before upgrading OpenClaw.",
    };
  }
  if (warnings > 0) {
    return {
      decision: "upgrade-with-caution",
      label: "Upgrade only with caution",
      message: "No hard blockers were found, but warnings remain. Review them before upgrading.",
    };
  }
  return {
    decision: "upgrade-ok",
    label: "Upgrade looks safe",
    message: "No hard errors or warnings were found by this run.",
  };
}
