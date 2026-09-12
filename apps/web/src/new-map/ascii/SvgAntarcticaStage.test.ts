import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SvgAntarcticaStage from "./SvgAntarcticaStage";
import { SVG_STORIES } from "./svg-scenarios";

describe("SvgAntarcticaStage", () => {
  it("renders the Claude-inspired opening story as inline SVG without Canvas", () => {
    const markup = renderToStaticMarkup(createElement(SvgAntarcticaStage, {
      story: SVG_STORIES[0],
      width: 1280,
      height: 720,
      anchorX: 640,
      anchorY: 560,
      motionEnabled: true,
      overlayState: "running",
      storyCount: SVG_STORIES.length,
      testId: "antarctic-ascii-overlay"
    }));

    expect(markup).toContain("<svg");
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).not.toContain("<canvas");
    expect(markup).toContain("data-renderer=\"svg\"");
    expect(markup).toContain("data-svg-story-count=\"34\"");
    expect(markup.match(/data-svg-role="smoker"/g)).toHaveLength(3);
    expect(markup.match(/data-svg-smoking-behavior="inhale-exhale"/g)).toHaveLength(3);
    expect(markup.match(/data-svg-smoking-phase="hand-to-mouth"/g)).toHaveLength(3);
    expect(markup.match(/data-svg-smoking-phase="exhale"/g)).toHaveLength(3);
    expect(markup.match(/data-svg-joint-contact="mouth"/g)).toHaveLength(3);
    expect(markup).toContain("<animateTransform");
    expect(markup).toContain('values="170 0 0;170 0 0;0 0 0;0 0 0;170 0 0;170 0 0"');
    expect(markup).toContain('values="-170 0 0;-170 0 0;0 0 0;0 0 0;-170 0 0;-170 0 0"');
    expect(markup.match(/data-svg-joint-tip="ember"/g)).toHaveLength(3);
    expect(markup).toContain("0%,58% { opacity: 0");
    expect(markup).toContain("@keyframes ant-exhale-puff");
    expect(markup).toContain("@keyframes ant-smoke-rise");
    expect(markup).toContain("@keyframes ant-leaf-rise");
    expect(markup).not.toContain("rotate(360deg)");
  });

  it("keeps a reduced-motion smoker at the mouth without SMIL motion", () => {
    const markup = renderToStaticMarkup(
      SvgAntarcticaStage({
        story: SVG_STORIES[0],
        width: 960,
        height: 240,
        anchorX: 480,
        anchorY: 180,
        motionEnabled: false,
        overlayState: "reduced-motion",
        storyCount: SVG_STORIES.length
      })
    );

    expect(markup).toContain('data-svg-smoking-mouth="contact"');
    expect(markup).not.toContain("<animateTransform");
  });

  it("renders the first wildlife scene with six named vector actors", () => {
    const markup = renderToStaticMarkup(createElement(SvgAntarcticaStage, {
      story: SVG_STORIES[1],
      width: 1280,
      height: 720,
      anchorX: 640,
      anchorY: 560,
      motionEnabled: false,
      overlayState: "reduced-motion",
      storyCount: SVG_STORIES.length
    }));

    expect(markup.match(/data-svg-animal=/g)).toHaveLength(6);
    expect(markup).toContain("data-svg-animal=\"penguin\"");
    expect(markup).toContain("data-svg-animal=\"orca\"");
    expect(markup).toContain("animation-play-state:paused");
  });

  it("renders every retained story as self-contained finite SVG markup", () => {
    SVG_STORIES.forEach((story) => {
      const markup = renderToStaticMarkup(createElement(SvgAntarcticaStage, {
        story,
        width: 1280,
        height: 720,
        anchorX: 640,
        anchorY: 560,
        motionEnabled: true,
        overlayState: "running",
        storyCount: SVG_STORIES.length
      }));
      const expectedActors = (story.people?.length ?? 0) + (story.animals?.length ?? 0);
      const expectedSmokers = story.people?.filter((person) => person.smoking).length ?? 0;

      expect(markup, story.id).toContain(`data-svg-story="${story.id}"`);
      expect(markup, story.id).toContain(`data-svg-figure-count="${expectedActors}"`);
      expect(markup, story.id).not.toContain("NaN");
      expect(markup, story.id).not.toContain("undefined");
      expect(markup, story.id).not.toContain("<script");
      expect(markup, story.id).not.toContain("<canvas");
      expect(markup.match(/data-svg-smoking-behavior="inhale-exhale"/g) ?? [], story.id).toHaveLength(expectedSmokers);
      expect(markup.match(/data-svg-joint-contact="mouth"/g) ?? [], story.id).toHaveLength(expectedSmokers);
      expect(markup.match(/data-svg-smoking-phase="exhale"/g) ?? [], story.id).toHaveLength(expectedSmokers);
      expect(markup, story.id).not.toContain('x1="24" y1="-54" x2="40" y2="-59"');
      if (story.people?.some((person) => person.motion === "orbit")) {
        expect(markup, story.id).toContain('data-svg-orbit-path="upright-ellipse"');
        expect(markup, story.id).toContain('type="translate"');
      }
    });
  });
});
