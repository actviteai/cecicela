title: "ship the docs site"
jobs:
  - id: j1
    goal: scaffold repo
    owner: self
    depends_on: []
    schedule: once
    status: done
    done_test: the repository builds an empty site
    artifact: repo/
    gpu: null
    cela_gate: COMPLETE
  - id: j2
    goal: content model
    owner: self
    depends_on: [j1]
    schedule: once
    status: done
    done_test: every page type has a schema and an example
    artifact: content-model.md
    gpu: null
    cela_gate: COMPLETE
  - id: j3
    goal: pick theme
    owner: self
    depends_on: [j1]
    schedule: once
    status: done
    done_test: a human approved the theme
    artifact: theme.md
    gpu: null
    cela_gate: null
  - id: j6
    goal: announce
    owner: self
    depends_on: [j1]
    schedule: once
    status: blocked
    done_test: a human approved the post
    artifact: announcement.md
    gpu: null
    cela_gate: null
  - id: j4
    goal: build pages
    owner: self
    depends_on: [j2]
    schedule: once
    status: done
    done_test: every page renders from the content model
    artifact: site/
    gpu: null
    cela_gate: COMPLETE
  - id: j5
    goal: deploy
    owner: self
    depends_on: [j3, j4]
    schedule: once
    status: running
    done_test: the deploy URL serves the home page
    artifact: deploy.log
    gpu: null
    cela_gate: null
events:
  - "j1 running cela:pending"
  - "j1 done cela:ok"
  - "j2 running cela:pending"
  - "j3 running"
  - "j2 done cela:ok"
  - "j3 gate gate:human"
  - "j4 running cela:pending"
  - "j4 done cela:ok"
  - "j3 done gate:approved"
  - "j6 blocked"
  - "j5 running cela:pending"
