Goal: Stabilize production map startup: GPS first click, basemap labels/landscape loading, zoom-in/zoom-out labels, without regressing colors/IP/manual hover.
State: checkpoint=.checkpoints/20260602-141520.patch; CI=PASS; Smoke=11/0; POST_CHECKS_OK=1; HUB_STAGE_REPORT_OK=1; Reports=8.7MB
Done: Analyzed videos 4-7. Root cause: map booted with empty style then setStyle, causing Safari style-diff rebuilds and intermittent missing basemap labels/landscape; worker source-map 404 also surfaced as console noise.
Done: Final CI output hardened: FAIL cannot contain green PASS markers or raw PASS CI_RESULT; MVP/final summaries are compact and keep required proof lines.
Done: Prod live access-block retry is bounded; live probe timeout now kills the process group and returns TIMEOUT instead of hanging.
Done: Old prod screenshots archived outside repo at ~/islegalcannabis_archive/reports_screenshots_20260602-111412; JSON and working data were not removed.
Done: Prod gates PASS: live=OK, payload total=1182.7KiB script=444.2KiB first_fill=822ms, js_city country=1660ms city=487ms legacy=0, GPS marker=7ms center=10ms recenter=1ms zoom_in_city_labels=42 zoom_out_countries=216.
Now: Commit and tag the green state through Tools/commit_if_green.sh.
Open questions: UNCONFIRMED none.
