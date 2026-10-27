# Worked example: `graph frames` without a live surface

The user typed `graph frames` where no artifact, canvas, or Studio window is available. Reveal the first screen column by column in exactly three blocks, then continue with one event line per turn.

```text
 ceciCela | ceci: ship the
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

 [###########.....] 4/6 don
 RUN   j5: deploy
+-- log.md ----------------
| #09     j3 done gate:appr
| #10     j6 blocked
| #11     j5 running cela:p
+--------------------------
 type: help  budget <level>
```

```text
 ceciCela | ceci: ship the docs site
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

 [###########.....] 4/6 done  1 running
 RUN   j5: deploy
+-- log.md -------------------------------------------
| #09     j3 done gate:approved
| #10     j6 blocked
| #11     j5 running cela:pending_
+-----------------------------------------------------
 type: help  budget <level>  animate  graph on|off  le
```

```text
 ceciCela | ceci: ship the docs site                              4/6 done  low
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

 [###########.....] 4/6 done  1 running
 RUN   j5: deploy
+-- log.md --------------------------------------------------------------------+
| #09     j3 done gate:approved                                                |
| #10     j6 blocked                                                           |
| #11     j5 running cela:pending_                                             |
+------------------------------------------------------------------------------+
 type: help  budget <level>  animate  graph on|off  legend            11 ev 207B
```
