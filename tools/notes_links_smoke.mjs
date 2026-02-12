import { createRequire } from "node:module";
import fs from "node:fs";
import { renderNotesFragments } from "../apps/web/src/lib/wikiNotesRender.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function renderFragmentsToHtml(text) {
  const fragments = renderNotesFragments(text);
  if (!fragments) {
    return renderToStaticMarkup(React.createElement("span", null, String(text || "")));
  }
  const nodes = fragments.map((part, index) => {
    if (part.type === "link") {
      return React.createElement(
        "a",
        {
          key: `link-${index}`,
          href: part.href,
          target: "_blank",
          rel: "noreferrer noopener"
        },
        part.text
      );
    }
    return React.createElement("span", { key: `text-${index}` }, part.value);
  });
  return renderToStaticMarkup(React.createElement(React.Fragment, null, nodes));
}

function countAnchors(html) {
  const matches = html.match(/<a\b/gi);
  return matches ? matches.length : 0;
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`NOTES_LINKS_SMOKE_FAIL ${msg}`);
    process.exit(1);
  }
}

const cases = [
  {
    name: "A",
    text: " \nMain article: Cannabis in Afghanistan Production banned...",
    titles: 1,
    forbidden: "Production"
  },
  {
    name: "B",
    text: "Main article: Cannabis in Algeria",
    titles: 1,
    forbidden: null
  },
  {
    name: "C",
    text: "Main articles: Cannabis in Canada, Cannabis laws of Canada by province or territory Legal for...",
    titles: 2,
    forbidden: "Legal for"
  }
];

for (const c of cases) {
  const html = renderFragmentsToHtml(c.text);
  assert(countAnchors(html) === c.titles, `${c.name} anchors=${countAnchors(html)} expected=${c.titles}`);
  assert(/https?:\/\/en\.wikipedia\.org\/wiki\//i.test(html), `${c.name} missing wiki href`);
  if (c.forbidden) {
    assert(!new RegExp(`<a[^>]*>[^<]*${c.forbidden}`, "i").test(html), `${c.name} tail linked`);
  }
}

const okLine = "NOTES_LINKS_SMOKE_OK=1";
console.log(okLine);
const reportPath = process.env.REPORTS_FINAL || "";
const runReportPath = process.env.RUN_REPORT_FILE || "";
const smokeFile = process.env.NOTES_LINKS_SMOKE_FILE || "";
if (reportPath) {
  fs.appendFileSync(reportPath, `${okLine}\n`);
}
if (runReportPath && runReportPath !== reportPath) {
  fs.appendFileSync(runReportPath, `${okLine}\n`);
}
if (smokeFile) {
  fs.writeFileSync(smokeFile, `${okLine}\n`);
}
