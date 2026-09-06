// Entry point. Importing a feature module is what wires it up: each one registers its own
// forms, event listeners, tab refreshers and render callbacks at import time, so adding a
// feature means adding one import here and nothing else.

import { refreshAll, loadStatus } from "./state.js";
import { refreshTaskList } from "./tasks.js";
import { refreshViewList } from "./misc.js";

import "./models-skills.js";
import "./agents.js";
import "./judging.js";
import "./compare.js";
import "./secrets.js";
import "./datasets.js";
import "./config-bundle.js";
import "./logs.js";

// ---------- init ----------
loadStatus();
refreshAll();
refreshTaskList();
refreshViewList();
// The status bar reflects live podman/harbor state, so it keeps checking rather than showing
// whatever was true when the page happened to load.
setInterval(loadStatus, 15000);
