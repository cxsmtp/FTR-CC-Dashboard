# Performance and sizing

Measured on CC-01.05.00 with `loadtest/run.sh` (and the same load against the container). The organisation: 202 people (8 regions × 24 Sales Engineers, their leaders, a VP and an Admin), 1,000 accounts and 3,000 reports.

All the load ran over **HTTPS**. The generator was pinned to other CPUs than the server.

## What 200 people do in the test

Each person signs in, then works for two minutes, pausing 0.5–2.5 s (1.5 s on average) between actions, as people do.

| Who | What they do |
| --- | --- |
| **Sales Engineers** | Overview and accounts; open an account; open the calculator page; list and open accounts in it; save (half the saves carry 300 Fusion projects, the size a large tenant's read gives); generate a report (25 KB of figures); record a sale; poll the background read; People. |
| **Leaders, the VP and the Admin** | The dashboards for all their teams and for one team; accounts; account pages; People. |

A stress run removes the pauses: everyone clicks as fast as the server answers.

## Results

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
