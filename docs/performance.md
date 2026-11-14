# Performance and sizing

Measured with `loadtest/run.sh` (first on CC-01.05.00, last on CC-01.113.00) (and the same load against the container). The organisation: 202 people (8 regions × 24 Sales Engineers, their leaders, a VP and an Admin), 1,000 accounts and 3,000 reports.

All the load ran over **HTTPS**. The generator was pinned to other CPUs than the server.

## What 200 people do in the test

Each person signs in, then works for two minutes, pausing 0.5–2.5 s (1.5 s on average) between actions, as people do.

| Who | What they do |
| --- | --- |
| **Sales Engineers** | Overview and accounts; open an account; open the calculator page; list and open accounts in it; save (half the saves carry 300 Fusion projects, the size a large tenant's read gives); generate a report (25 KB of figures); record a sale; poll the background read; People. |
| **Leaders, the VP and the Admin** | The dashboards for all their teams and for one team; accounts; account pages; People. |

A stress run removes the pauses: everyone clicks as fast as the server answers.

## Results, CC-01.113.00 (2026-11-14)

The same organisation and load, after the review and clean-up releases (CC-01.95 to CC-01.112), over HTTPS. Each run
was on a fresh copy of the data, with the server pinned to its CPUs and the load generator to two others.

| Run | Server | Requests/s | Errors | Slowest action, p95 | Slowest, p99 | Server CPU (1 core = 100%) | Memory (RSS, max) |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| **200 people, normal pace** | **2 vCPU** | **124** | **0** | **21 ms** | **33 ms** | **avg 25%, max 40%** | **240 MB** |
| **200 people, normal pace** | **1 vCPU** | **123** | **0** | **24 ms** | **104 ms*** | **avg 25%, max 38%** | **246 MB** |
| 200 people, stress (no pauses) | 2 vCPU | 608 | 0 | 373 ms | 442 ms | ~100% (one core: Node.js) | 345 MB |
| The same stress, CC-01.112.00 (before the fix below) | 2 vCPU | 520 | 0 | 430 ms | 485 ms | ~100% | 328 MB |
| The same stress, CC-01.54.00, on this machine | 2 vCPU | 604 | 0 | 419 ms | 469 ms | ~100% | 405 MB |

\* The team dashboard, opened 73 times in the run: one slow answer sets its p99. Every other action stays under 34 ms
at p99 on one CPU.

At a normal pace, half of all answers take 1–4 ms on the server and sign-in 50–60 ms (by design: scrypt).

**What the test found, and the fix.** Under stress CC-01.112 served 14% less than CC-01.54 on the same machine, with
every action slower alike: a cost on every request. The profile showed it: deciding which accounts are still drafts
went through all 3,000 reports and 1,000 accounts on every request, even for one account or an Admin, and the reports
were sorted again for every dashboard. Both are now worked out once for each state of the data (they are worked out
again when an account or a report changes), and an Admin or an account's own SE is not looked up at all. Stress
throughput is back to CC-01.54's, and the slowest answers are faster than then.

**Left as it is, on purpose.** Compressing large answers (the dashboards) is now the largest single cost, about a
sixth of the server's time under stress. A faster level would save under a millisecond an answer but send about 23%
more to people working from far away: not worth it.

## Results, CC-01.54.00 (2026-11-11)

The same organisation and load, run again after the security fixes of CC-01.54.00, over HTTPS (the load generator now checks the server's certificate).

| Run | Server | Requests/s | Errors | Slowest action, p95 | Slowest, p99 | Server CPU (1 core = 100%) | Memory (RSS, max) |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| **200 people, normal pace** | **2 vCPU** | **123** | **0** | **13 ms** | **51 ms** | **avg 25%, max 45%** | **248 MB** |
| **200 people, normal pace** | **1 vCPU** | **123** | **0** | **24 ms** | **44 ms** | **avg 23%, max 32%** | **249 MB** |
| 200 people, stress (no pauses) | 2 vCPU | 591 | 0 | 390 ms | 432 ms | ~100% (one core: Node.js) | 415 MB |

Sign-in: 74–76 ms at p95 at normal pace. Under stress, when all 200 sign in at the same moment, sign-in waits its turn for password hashing (scrypt, p95 11 s) and the requests queued behind that first burst take up to 15 s; once signed in, every action stays under 0.45 s at p99.

## Results, CC-01.05.00

| Run | Server | Requests/s | Errors | Slowest action, p95 | Slowest, p99 | Server CPU (1 core = 100%) | Memory (RSS, max) |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 200 people, normal pace (before tuning) | 2 vCPU | 123 | 0* | 37 ms | 65 ms | avg 39%, max 60% | 301 MB |
| **200 people, normal pace** | **2 vCPU** | **124** | **0** | **10 ms** | **54 ms** | **avg 21%, max 31%** | **215 MB** |
| 200 people, normal pace | 1 vCPU | 124 | 0 | 15 ms | 35 ms | avg 22%, max 31% | 220 MB |
| **200 people, normal pace, in the container** (`--cpus=2 --memory=1g`) | **container** | **123** | **0** | **11 ms** | **41 ms** | **avg 29%, max 47%** | **128 MB** |
| 200 people, stress (no pauses) | 2 vCPU | 628 | 0 | 369 ms | 443 ms | ~100% (one core: Node.js) | 395 MB |
| 200 people, stress (no pauses) | 1 vCPU | 530 | 0 | 379 ms | 505 ms | 96% | 392 MB |

\* The only errors in the first run came from the test itself: it asked the audit log as leaders, who may not read it.

**Sign-in** takes 45–60 ms at p95, by design: passwords are hashed with scrypt.

**Headroom.** 200 people at work need about a fifth of one core. One core serves 530–630 requests a second, about five times their load: roughly **1,000 people at once on one core**. Every run, the stress runs included, finished with no errors.

**Tuning made for these numbers (CC-01.05.00):**
- **The calculator page.** It is 2 MB. It is now the same for everyone: compressed once (gzip) and cached by the browser with an ETag. Each person's settings come from `/api/cc/calc-config`.
- **Compression.** The dashboard's files are compressed and cached; large JSON answers are compressed.
- **The overview.** It groups the reports by account once, instead of looking through every report for every account.

## Recommended server

| | Minimum (up to ~200 people) | Comfortable (up to ~1,000 people) |
| --- | --- | --- |
| CPU | 1 vCPU | 2 vCPU |
| Memory | 1 GB (the app uses 130–400 MB) | 2 GB |
| Disk for `/data` | 5 GB | 20 GB |
| Container limits | `--cpus=1 --memory=1g` | `--cpus=2 --memory=2g` |

**What uses the disk** (back it up):
- reports: about 25 KB each;
- an account read from a large tenant: about 150 KB;
- the audit log;
- 14 backups;
- installed versions: about 15 MB each.

In the test, two minutes of 200 people saving 300-project reads and generating reports grew the data from 17 MB to 88 MB. Expect a few GB a year for a busy organisation.

**Reading Checkmarx One and counting code from git** run in the background and mostly wait on Checkmarx One and the git hosts. Git counts run two at a time and use `/tmp` (the container's tmpfs) while they run. Give the container more memory if SEs count very large repositories.

## Run it yourself

```bash
loadtest/run.sh 200 120
```

```bash
SERVER_CPUS=0 GEN_CPUS=2-3 loadtest/run.sh 200 120
```

```bash
THINK_MS=0 loadtest/run.sh 200 60
```

The second pins the server to one CPU; the third is the stress run.
