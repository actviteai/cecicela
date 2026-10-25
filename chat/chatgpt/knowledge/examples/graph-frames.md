# Worked example: `graph frames` without a live surface

The user typed `graph frames` where no artifact, canvas, or Studio window is available. Reveal the first screen column by column in exactly three blocks, then continue with one event line per turn.

```text
 ceciCela  TUI | ceci: ship
  +==============+    +====
  |j1 scaffold re|-+->|j2 c
  | done  cela OK| |  | don
  +==============+ |  +====
                   |
                   |  +====
                   +->|j3 p
                   |  | don
                   |  +====
                   |
                   |  +----
                   +->|j6 a
                      | pen
                      +----


 LEGEND +--+ pending  +==+
+-- log.md ----------------
| turn 09  j3 done gate:app
| turn 10  j6 blocked
| turn 11  j5 running cela:
+--------------------------
 [G]raph [F]rames [L]egend
```

```text
 ceciCela  TUI | ceci: ship the docs site
  +==============+    +==============+    +===========
  |j1 scaffold re|-+->|j2 content mod|--->|j4 build pa
  | done  cela OK| |  | done  cela OK|    | done  cela
  +==============+ |  +==============+    +===========
                   |
                   |  +==============+
                   +->|j3 pick theme |-----------o*---
                   |  | done         |
                   |  +==============+
                   |
                   |  +--------------+
                   +->|j6 announce   |
                      | pending      |
                      +--------------+


 LEGEND +--+ pending  +==+ done  |/-\ running  ! GATE
+-- log.md -------------------------------------------
| turn 09  j3 done gate:approved
| turn 10  j6 blocked
| turn 11  j5 running cela:pending_
+-----------------------------------------------------
 [G]raph [F]rames [L]egend [SPC]pause [S]tep [T]heme [
```

```text
 ceciCela  TUI | ceci: ship the docs site                  turn 11/11  graph:on
  +==============+    +==============+    +==============+    +--------------+
  |j1 scaffold re|-+->|j2 content mod|--->|j4 build pages|*+->|j5 deploy     |
  | done  cela OK| |  | done  cela OK|    | done  cela OK| |  | | run  cela..|
  +==============+ |  +==============+    +==============+ |  +--------------+
                   |                                       |
                   |  +==============+                     |
                   +->|j3 pick theme |-----------o*--------+
                   |  | done         |
                   |  +==============+
                   |
                   |  +--------------+
                   +->|j6 announce   |
                      | pending      |
                      +--------------+


 LEGEND +--+ pending  +==+ done  |/-\ running  ! GATE waiting  * packet --> deps
+-- log.md --------------------------------------------------------------------+
| turn 09  j3 done gate:approved                                               |
| turn 10  j6 blocked                                                          |
| turn 11  j5 running cela:pending_                                            |
+------------------------------------------------------------------------------+
 [G]raph [F]rames [L]egend [SPC]pause [S]tep [T]heme [-+]speed [R]eset 11ev=207B
```
