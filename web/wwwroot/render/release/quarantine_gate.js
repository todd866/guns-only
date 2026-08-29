import {
  EXPERIENCE_RELEASE_STATE,
  experienceById,
} from "../progression/campaign_progression.js";
import {
  standaloneNavigationHref,
  syncStandaloneReturnLinks,
} from "../shell/standalone_navigation.js";

function previewRequested(locationLike) {
  try {
    return new URL(locationLike?.href || "https://invalid.local/")
      .searchParams.get("preview") === "1";
  } catch {
    return false;
  }
}

export function experienceAccess(experienceId, locationLike = globalThis.location) {
  const experience = experienceById(experienceId);
  if (!experience) {
    return Object.freeze({
      allowed: false,
      preview: false,
      experience: null,
      reason: "Unknown experience.",
    });
  }
  const stateAccess = releaseStateAccess(
    experience.releaseState,
    previewRequested(locationLike),
  );
  return Object.freeze({
    allowed: stateAccess.allowed,
    preview: stateAccess.preview,
    experience,
    reason: stateAccess.allowed
      ? ""
      : experience.blocker || (experience.releaseState === EXPERIENCE_RELEASE_STATE.RETIRED
        ? "This experience is retired."
        : "This experience is not available."),
  });
}

export function releaseStateAccess(releaseState, previewAcknowledged = false) {
  const production = releaseState === EXPERIENCE_RELEASE_STATE.PRODUCTION;
  const comingSoon = releaseState === EXPERIENCE_RELEASE_STATE.COMING_SOON;
  const previewable = releaseState === EXPERIENCE_RELEASE_STATE.PREVIEW
    || releaseState === EXPERIENCE_RELEASE_STATE.QUARANTINED;
  const preview = previewable && previewAcknowledged === true;
  // Coming-soon cards may be selected on the public Ready screen, but they never launch.
  return Object.freeze({ allowed: production || comingSoon || preview, preview });
}

export function releaseHomeHref(locationLike = globalThis.location) {
  return standaloneNavigationHref("/", locationLike);
}

function link(documentLike, href, label, primary = false) {
  const anchor = documentLike.createElement("a");
  anchor.href = href;
  anchor.textContent = label;
  Object.assign(anchor.style, {
    display: "inline-block",
    margin: "0.5rem 0.75rem 0 0",
    padding: "0.75rem 1rem",
    border: "1px solid #87b49a",
    borderRadius: "0.35rem",
    color: primary ? "#07100b" : "#dce8df",
    background: primary ? "#8fcca7" : "transparent",
    textDecoration: "none",
    fontWeight: "700",
  });
  return anchor;
}

/**
 * Replace a quarantined route with a truthful release notice. `?preview=1` is an explicit,
 * non-security testing acknowledgement: it makes development paths usable without pretending
 * they are accepted production experiences.
 */
export function renderExperienceGate({
  experienceId,
  documentLike = globalThis.document,
  locationLike = globalThis.location,
} = {}) {
  const access = experienceAccess(experienceId, locationLike);
  // This module runs before an accepted standalone's heavier main graph. Establish the audio-QA
  // navigation boundary now, so even an immediately clicked catalogue link cannot drop silence.
  syncStandaloneReturnLinks(documentLike, locationLike);
  if (access.allowed) return access;
  if (!documentLike?.body || !access.experience) return access;

  const current = new URL(locationLike.href);
  current.searchParams.set("preview", "1");
  const main = documentLike.createElement("main");
  main.id = "release-quarantine";
  main.setAttribute("role", "main");
  Object.assign(main.style, {
    boxSizing: "border-box",
    width: "min(44rem, calc(100% - 2rem))",
    margin: "10vh auto",
    padding: "clamp(1.5rem, 5vw, 3rem)",
    border: "1px solid rgba(143, 204, 167, 0.45)",
    borderRadius: "0.75rem",
    background: "#0b1410",
    color: "#e9f0eb",
    font: "16px/1.55 system-ui, sans-serif",
  });
  const kicker = documentLike.createElement("p");
  kicker.textContent = `${access.experience.releaseState.toUpperCase()} · DEVELOPMENT ROUTE`;
  const title = documentLike.createElement("h1");
  title.textContent = `${access.experience.title} is not a production experience yet`;
  const reason = documentLike.createElement("p");
  reason.textContent = access.reason;
  const boundary = documentLike.createElement("p");
  boundary.textContent = "The route remains available for deliberate testing, but it has not completed its player-path acceptance gate.";
  const preview = link(documentLike, current.href, "Open experimental preview", true);
  const home = link(documentLike, releaseHomeHref(current), "Return to Guns Only");
  main.append(kicker, title, reason, boundary, preview, home);
  documentLike.body.replaceChildren(main);
  documentLike.title = `${access.experience.title} · experimental preview`;
  return access;
}
