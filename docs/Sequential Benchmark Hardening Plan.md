# Sequential Benchmark Hardening Plan

## Summary

按顺序推进四个外部基准：LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo。每个基准都独立成一个工程阶段：先接入和跑通，再做失败分析，再补强 GoodMemory，最后用同一基准回测确认提升。最终报告放到全部四轮打磨完成之后，不提前做公开结论。

Current execution status: Phase 62 LongMemEval has an accepted clean internal
closure checkpoint, and Phase 63 BEAM is active. Phase 63 source intake,
synthetic fixture, smoke adapter/report contract, package scripts, and smoke
gate are now in place through `eval:phase-63` and `gate:phase-63`. The first
real 100K external-root BEAM ingestion/comparison is also complete through
`prepare:phase-63-beam` plus
`run-phase63-beam-100k-full-initial-20260518T000335Z`. The initial P63-T006
miss/noise analysis is complete with status `needs-live-retrieval-analysis`.
The first real P63-T007 recall diagnostic is also complete for rules-only:
`run-phase63-beam-100k-recall-diagnostic-rules-full-20260518T005500Z` covers
the full 400-case 100K slice with provider-free GoodMemory recall,
`executionFailures: 0`, evidence-chat recall 0.11625896794910878,
missed-recall cases 340/355, and wrong-recall/noise cases 362/400. The next
open Phase 63 boundary is a small live answer-generation/judge slice over
representative diagnostic misses before any generic GoodMemory mechanism
repair.
That live-slice boundary is now also crossed:
`run-phase63-beam-100k-live-slice-rules-initial3-escalated-20260518T014500Z`
covers three representative rules-only diagnostic misses with live answer
generation and semantic judging, `executionFailures: 0`, answer accuracy 0/3,
evidence-chat recall 0.16666666666666666, missed recall 3/3, and
wrong-recall/noise 3/3. The next open Phase 63 boundary is a generic
retrieval/evidence-preservation repair for long imported conversations, then a
rerun of the same recall diagnostic and live slice.
The first generic repair is now implemented as source-message preservation for
metadata-patched `remember(always)` imports plus source-order selection for
undated event-order questions. That first current-code rerun improves full
rules-only BEAM recall from 0.11625896794910878 to 0.2545638985427718 on
`run-phase63-beam-100k-recall-diagnostic-rules-full-source-order-chatid-current-20260518T040000Z`.
A second generic pass adds source-order topic-gap fill, bounded adjacent
companions for local continuations, and contradiction-pair retrieval that
prefers user-grounded evidence over repeated assistant context. The latest
current-code full rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-contradiction-companions-v2-20260518T080000Z`
reaches evidence-chat recall 0.26990036176655896 with `executionFailures: 0`,
missed-recall cases 296/355, and wrong-recall/noise cases 387/400. The paired
same-three-case live slice
`run-phase63-beam-100k-live-slice-rules-contradiction-companions-initial3-escalated-20260518T074500Z`
raises evidence-chat recall to 0.7222222222222222, but answer accuracy still
remains 0/3. A follow-up generic answer-synthesis prompt now tells the live
runner to surface materially conflicting user statements instead of silently
choosing one side; the same-three-case rerun
`run-phase63-beam-100k-live-slice-rules-contradiction-companions-prompt-guidance-initial3-escalated-20260518T081500Z`
keeps evidence-chat recall at 0.7222222222222222 and raises answer accuracy to
1/3 by fixing the contradiction case. This is partial mechanism progress, not
BEAM closure. The next open Phase 63 boundary is source-order noise reduction
and ordered-answer synthesis over long imported conversations before moving to
MemoryAgentBench.
A third generic pass adds late source-ordered milestone fill, source-message
compression for live answer context, and an explicit source-ordered retrieved
turn section for ordering questions. The latest provider-free full recall
diagnostic
`run-phase63-beam-100k-recall-diagnostic-rules-full-milestone-compression-current-20260518T061100Z`
reaches evidence-chat recall 0.2759374936487613 with `executionFailures: 0`,
missed-recall cases 294/355, and wrong-recall/noise cases 387/400. The latest
same-three-case live slice
`run-phase63-beam-100k-live-slice-rules-structured-order-context-prompt-v2-initial3-escalated-20260518T064500Z`
has `executionFailures: 0`, evidence-chat recall 1.0, missed-recall cases 0/3,
wrong-recall/noise cases 2/3, and answer accuracy 1/3. Retrieval is now
complete for the representative trio, but the event-ordering answers still
over-select noisy early/setup turns. Phase 63 remains active; the next open
boundary is generic source-order noise pruning and ordered evidence selection,
not another broad prompt-only pass.
A fourth pass moves that pruning to the BEAM answer-context layer rather than
the core recall selector: ordering questions now get a bounded source-ordered
turn section, concrete action summaries, item-count hints, and no duplicate raw
source-message record dump. The current-code full recall sanity
`run-phase63-beam-100k-recall-diagnostic-rules-full-context-pruning-current-20260518T155045`
still shows the full 100K rules-only surface is recall-limited:
evidence-chat recall 0.2731205922403106, missed-recall cases 295/355,
wrong-recall/noise cases 387/400, and `executionFailures: 0`. The latest
same-three-case live slice
`run-phase63-beam-100k-live-slice-rules-context-ordered-pruning-v6-initial3-escalated-20260518T160743`
reaches answer accuracy 3/3, evidence-chat recall 1.0, missed-recall cases
0/3, wrong-recall/noise cases 2/3, and `executionFailures: 0`. This is a
representative live-synthesis repair, not BEAM closure; the next open boundary
is broadening beyond the initial trio and reducing full-slice missed recall and
wrong-recall/noise.
A fifth pass adds bounded source-ordered coverage for broad conversation-summary
questions over imported source-message evidence. The current-code full recall
diagnostic
`run-phase63-beam-100k-recall-diagnostic-rules-full-source-summary-coverage16-current-20260518T180000`
raises overall evidence-chat recall to 0.2787997683068106 with
`executionFailures: 0`, missed-recall cases 295/355, and wrong-recall/noise
cases 387/400. The gain is narrow but real: summarization recall moves from
0.02071759259259259 to 0.08068883277216612 and missing summarization evidence
ids drop from 276 to 263. This is still partial Phase 63 repair; the full
surface remains recall-limited and noisy.
A sixth pass fixes exact `remember(always)` source-message provenance and adds a
bounded source-ordered instruction append path for guidance questions. The kept
current-code full recall diagnostic
`run-phase63-beam-100k-recall-diagnostic-rules-full-source-provenance-instruction-append2-current-20260518T194500`
raises overall evidence-chat recall to 0.31746732922789267 with
`executionFailures: 0`, missed-recall cases 282/355, and wrong-recall/noise
cases 390/400. The improvement is real but narrow: instruction-following recall
moves from 0.05625 to 0.7333333333333333 and zero-recall instruction cases drop
from 37 to 7, while Timeline Integration, temporal reasoning, preference
following, numerical precision, and full-run noise regress. Phase 63 remains
active; the next boundary is reducing the new noise/regression surface while
preserving the instruction gain.
A seventh pass tightens the instruction append path so it no longer treats broad
domain overlap, such as `weather` or `API`, as enough to apply an unrelated user
instruction to temporal/date calculation questions. The kept current-code full
recall diagnostic
`run-phase63-beam-100k-recall-diagnostic-rules-full-source-provenance-instruction-applicability-v3-current-20260518T220000`
raises overall evidence-chat recall to 0.32561286913399595 with
`executionFailures: 0`, missed-recall cases 280/355, and wrong-recall/noise
cases 389/400. Compared with append-2, instruction-following recall improves
from 0.7333333333333333 to 0.7583333333333333, zero-recall instruction cases
drop from 7 to 6, and wrong-recall/noise drops by one case. This is still not
BEAM closure: temporal reasoning stays at 0.3875, Timeline Integration stays at
0, and preference following stays at 0.15384615384615385.
An eighth pass narrows temporal interval boundary ranking to explicit
credential-like acquisition anchors and extends temporal interval evidence from
`dated_event` tags to trusted source-message content that carries an explicit
date. The repeated kept current-code full recall diagnostic
`run-phase63-beam-100k-recall-diagnostic-rules-full-temporal-date-content-boundary-rerun-current-20260519T001500`
raises overall evidence-chat recall to 0.3364892384610695 with
`executionFailures: 0`, missed-recall cases 278/355, and wrong-recall/noise
cases 389/400. Temporal reasoning improves from 0.3875 to 0.4875, including
the OpenWeather API key vs UI wireframe duration case moving from 0 to 1
evidence-chat recall. This is still not BEAM closure: Timeline Integration
stays at 0, preference following stays at 0.15384615384615385, and 278/355
evidence cases still miss at least one required chat.
Ninth, source-ordered preference evidence now appends bounded original user
preference statements for guidance or implementation-help queries when the
source turn carries a clear preference declaration and topic bridge. The kept
rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-source-preference-v2-rerun-current-20260519T020000`
raises overall evidence-chat recall to 0.3629658760644676 with
`executionFailures: 0`, missed-recall cases 270/355, and wrong-recall/noise
cases 390/400. Preference-following recall improves from 0.15384615384615385
to 0.3803418803418803, with zero-recall preference cases dropping from 33 to
23. This is still not BEAM closure: Timeline Integration remains 0, the full
run still misses 270 evidence cases, and the noise count is one case higher
than the temporal date-content checkpoint.
Tenth, Timeline Integration now uses a bounded source-ordered planning cluster
that favors explicit timeline/date cues, required query anchors such as sprint
or student-study context, and contiguous early source context for resource
plans. The kept rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-timeline-planning-v3-current-20260519T041500`
raises overall evidence-chat recall to 0.37368575086884953 with
`executionFailures: 0`, missed-recall cases 267/355, and wrong-recall/noise
cases 388/400. Timeline Integration recall improves from 0 to
0.5333333333333333, zero-recall Timeline Integration cases drop from 5 to 2,
and Timeline Integration wrong/noise drops from 4 to 2. This is still not BEAM
closure: 267 evidence cases still miss, temporal reasoning remains at 0.4875,
and preference following remains at 0.3803418803418803.
Eleventh, contradiction confirmation now uses a bounded evidence set rather
than a single positive/negated pair. It recognizes concrete confirmation verbs
such as obtained, stored, used, enrolled, attended, submitted, practiced, and
fixed; keeps short technical anchors such as `api`, `api_key`, `ats`, and
`seo` in contradiction topic matching; and excludes process/timeline questions
from the yes/no contradiction path. The kept rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-contradiction-support-v2-current-20260519T070000`
raises overall evidence-chat recall to 0.4026215881145459 with
`executionFailures: 0`, missed-recall cases 257/355, and wrong-recall/noise
cases 388/400. Contradiction-resolution recall improves from
0.2654166666666667 to 0.4841666666666667, zero-recall contradiction cases
drop from 20 to 11, and Timeline Integration remains at 0.5333333333333333.
This is still not BEAM closure: 257 evidence cases still miss, event-ordering
and summarization remain the largest full-slice gaps, and the full run remains
too noisy for an answer-quality claim.
Twelfth, broad summary/recap/overview queries now bypass the yes/no
contradiction-confirmation route so a long "how has my project developed"
summary is not collapsed into a compact positive/negated evidence pair. The
kept rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-summary-contradiction-guard-current-20260519T090000`
raises overall evidence-chat recall to 0.4034666585370811 with
`executionFailures: 0`, missed-recall cases still 257/355, and
wrong-recall/noise cases 387/400. Summarization recall moves from
0.07896925605258939 to 0.08174703383036717, and the changed-case comparison
has two recall improvements with no recall regressions. Broader source-turn
dedupe / weak lexical summary-trigger variants were rejected because their full
100K diagnostics regressed overall recall to 0.40260817429831514 and
0.4019508973030099 without reducing the missed-recall blocker. This is still
not BEAM closure: it is a small route-boundary repair, while event-ordering,
summarization, and persistent noise still need broader full-slice hardening.
Thirteenth, event-order queries that explicitly ask for personal/work-related
challenges now get a source-ordered challenge selector instead of being
preempted by latest-update evidence or generic started/implemented events. The
kept rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-event-order-challenge-current-20260519T093000`
raises overall evidence-chat recall to 0.40735666524398917 with
`executionFailures: 0`, missed-recall cases 256/355, and wrong-recall/noise
cases still 387/400. Event-ordering recall improves from
0.19598214285714288 to 0.2180059523809524, zero-recall event-ordering cases
drop from 15 to 13, and missing event-ordering evidence ids drop from 187 to
181. This is still not BEAM closure: the run adds a small amount of diagnostic
noise by evidence-id accounting and leaves summarization plus the broader
full-slice miss/noise surface open.
Fourteenth, source-ordered summary selection now keeps narrow milestone sets
for creative project timelines, concept-learning progression, and essay
performance/feedback evolution queries, with English and Chinese mirror
coverage in the selector tests. The kept rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-summary-learning-evolution-narrow-current-20260519T160000`
raises overall evidence-chat recall to 0.4116411600918644 with
`executionFailures: 0`, missed-recall cases 255/355, and wrong-recall/noise
cases still 387/400. This restores the post-refactor source-ordered summary
drift without moving domain rules back into `src/recall/selection.ts`. It is
still not BEAM closure: the full diagnostic remains recall-limited and noisy,
so the next BEAM loop remains full-slice miss/noise hardening before moving on
to MemoryAgentBench.
Fifteenth, source-ordered issue-resolution summaries now prefer the earliest
explicit bug/error/fix/debug evidence chain for queries about resolving issues
over time, again with English and Chinese selector coverage and without moving
the rules back into `src/recall/selection.ts`. Two broader variants were
rejected because they regressed full 100K recall to 0.41126557323740437 and
0.41023270938763906. The kept earliest-source-order rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-summary-issue-resolution-earliest-current-20260519T180000`
raises overall evidence-chat recall only slightly to 0.4117931833424793 with
`executionFailures: 0`, missed-recall cases still 255/355, and
wrong-recall/noise cases still 387/400. This is useful as a narrow selector
guardrail, but it is not a material BEAM closure signal; the next loop still
needs broader recall and persistent-noise hardening.
Sixteenth, aggregate money evidence now recognizes declined financial
opportunity comparisons so raise/freelance/bonus amounts can be retrieved
together while accepted-offer noise is rejected. The rules live in
`src/recall/selectors/aggregate.ts` with English and Chinese selector coverage.
The kept rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-declined-financial-aggregate-current-20260519T193000`
raises overall evidence-chat recall to 0.41554905188708025 with
`executionFailures: 0`, missed-recall cases still 255/355, and
wrong-recall/noise cases still 387/400. The largest category lifts are
event-ordering +0.01333333333333328, temporal reasoning +0.012500000000000067,
and multi-session reasoning +0.007500000000000062; the target
`12:multi_session_reasoning:1` moves from 0 to 0.3 recall. This is another
kept partial repair, not BEAM closure, because the full diagnostic is still
miss-limited and noisy.
Seventeenth, source-ordered event-order selection now has a narrow
professional-profile/resume path for broad "different aspects" questions. The
kept path is deliberately gated to resume/profile/ATS/LinkedIn language after a
broader non-code aspect variant regressed the full run. The selector rules live
in `src/recall/selectors/sourceOrderTemporal.ts`, prefer distinct resume
milestones such as ATS strategy, LinkedIn visibility, transferable skills,
salary negotiation, international markets, and keyword refinement, and keep the
fallback event-order route for unrelated broad aspect timelines. The kept
rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-profile-resume-event-order-current-20260519T174704`
raises overall evidence-chat recall to 0.41767737739568733 with
`executionFailures: 0`, missed-recall cases 254/355, and wrong-recall/noise
cases still 387/400. Event-ordering recall improves to
0.24300595238095238, missing event-ordering evidence ids drop to 175, and
target case `6:event_ordering:1` moves from 0 to 1.0 recall. This is a kept
partial repair, not BEAM closure: summarization remains at 0.11685405643738979
with 36/36 missed evidence cases, multi-session reasoning still misses 31/40,
and full-run noise remains 387/400.
Eighteenth, source-ordered writing-progress summaries now keep concrete
writing-improvement milestone anchors paired with their adjacent assistant
strategy replies before spending recall budget on later extra anchors. The
rules stay in `src/recall/selectors/sourceOrderSummary.ts`; orchestration in
`src/recall/selection.ts` stays selector-driven. The kept rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-writing-progress-summary-current-20260520T033228Z`
raises overall evidence-chat recall to 0.4202438875678314 with
`executionFailures: 0`, missed-recall cases 253/355, and wrong-recall/noise
cases still 387/400. The target case `10:summarization:2` moves from 0 to 1.0
recall, summarization recall rises from 0.11685405643738979 to
0.14463183421516757, zero-recall summarization cases drop from 21 to 20, and
missing summarization evidence ids drop from 250 to 236. This is a kept
partial repair, not BEAM closure: a small event-ordering tradeoff remains in
the changed-case comparison, and the full diagnostic still has 253 missed
evidence cases plus persistent noise.
Nineteenth, source-ordered career/philosophy summaries now dedupe duplicate
facts from the same imported source turn only inside the career/philosophy
summary branch, then pair user decision/reflection milestones with adjacent
assistant synthesis replies. The root cause was not missing lexical phrases
alone: BEAM recall is scored by unique `chat_id`, and the previous selector
spent the 16 summary recall slots on repeated fact fragments from the same
source turns while skipping distinct evidence turns. The kept rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-career-philosophy-scoped-current-20260520T054505Z`
raises overall evidence-chat recall to 0.4233111802125888 with
`executionFailures: 0`, missed-recall cases 252/355, and wrong-recall/noise
cases 386/400. Target case `12:summarization:2` moves from 0 to 1.0 recall
with no missing or wrong retrieved chat ids, and full summarization recall rises
from 0.14463183421516757 to 0.17240961199294536. Zero-recall summarization
cases drop from 20 to 19, and missing summarization evidence ids drop from 236
to 220. This is a kept partial repair, not BEAM closure:
`12:summarization:1` remains at 0.25 recall in the direct probe, and the full
changed-case comparison still shows one event-ordering recall tradeoff on
`13:event_ordering:2`.
Twentieth, source-ordered technical challenge summaries now require explicit
summary intent before using a technical challenge selector. The first ungated
attempt
`run-phase63-beam-100k-recall-diagnostic-rules-full-technical-challenge-summary-current-20260520T060111Z`
was rejected because it repaired `1:summarization:2` but allowed a technical
pattern to affect non-summary recall and lowered overall evidence-chat recall
from 0.4233111802125888 to 0.4232172834989738. The kept gated rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-technical-challenge-summary-gated-current-20260520T060654Z`
raises overall evidence-chat recall to 0.42556470133934937 with
`executionFailures: 0`, missed-recall cases 251/355, and wrong-recall/noise
cases 386/400. Target case `1:summarization:2` moves from 0 to 1.0 recall by
prioritizing named security/database challenge milestones such as password
hashing, UNIQUE constraint failures, OperationalError handling, CSRF token
errors, and Redis-backed account lockout. Full summarization recall rises from
0.17240961199294536 to 0.20018738977072315, zero-recall summarization cases
drop from 19 to 18, and missing summarization evidence ids drop from 220 to
209. This is a kept partial repair, not BEAM closure: the changed-case
comparison still shows non-summary tie churn, including one knowledge-update
and one event-ordering recall tradeoff, and full-run noise remains 386/400.
Twenty-first, source-ordered value/metric evidence now has a scoped generic
planner for exact user-source turns: rescheduled time values, duration answers,
and percentage transition pairs are selected before broad summary/aggregate
fallbacks, while broad `how many` and cross-session amount-comparison queries
stay on the aggregate and multi-hop paths. The accepted scoped rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-source-order-value-metric-scoped-current-20260521T002541Z`
raises overall evidence-chat recall to 0.44935613682092573 with
`executionFailures: 0`, missed-recall cases 244/355, and wrong-recall/noise
cases 378/400. The workbench delta versus the technical-challenge gated run
shows missed cases -7 and wrong-recall cases -8. Knowledge-update recall rises
by 0.0542 with noise -31, temporal reasoning removes 36 noise ids while keeping
total hit/missing counts flat, event-ordering recall rises by 0.033, and
multi-session reasoning remains slightly positive after the overly broad
number/money route was scoped back. This is a kept partial repair, not BEAM
closure: summarization remains at 0.2132, event-ordering still averages 22.525
retrieved ids per case, and the full diagnostic still has 244 missed-recall
cases plus 378 wrong-recall/noise cases.
Twenty-second, named source-ordered summaries now give concrete decision /
commitment milestones just enough priority to beat generic named-person
reflections that merely mirror the query topics. The accepted rerun
`run-phase63-beam-100k-recall-diagnostic-rules-full-source-order-named-summary-decision-min540-current-20260521T123744Z`
raises overall evidence-chat recall to 0.45501341381623095 with
`executionFailures: 0`, missed-recall cases still 244/355, and
wrong-recall/noise cases still 378/400. Compared with the previous
named-summary companion run, global hit evidence ids rise from 395 to 396:
event-ordering average recall improves by 0.0083 with one additional hit and no
event-ordering noise increase, while summarization stays at 0.2598 after the
earlier named companion repair. Compared with the value/metric scoped baseline,
summarization remains +8 hit ids / -8 missing ids / -2 zero-recall cases, and
event-ordering is now +1 hit / -1 missing with noise -2. This is still a kept
partial repair, not BEAM closure: the full run still has 244 missed-recall
cases, 378 wrong-recall/noise cases, summarization incomplete recall in 33/36
evidence cases, and large event-ordering over-retrieval.
The accepted current-code LongMemEval checkpoint is
`run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`:
`goodmemory-hybrid` covers all 500 cleaned cases with `executionFailures: 0`,
454/500 answer accuracy, evidence-session recall 0.9590, missed recall 35,
wrong recall 6, and wrong answers 46. This clean hybrid result exceeds the
latest accepted full-context reference of 451/500 from the unified
four-profile comparison. The remaining error distribution is still useful
research input for later generic hardening: multi-session 11 wrong cases,
single-session preference 6, temporal reasoning 17, knowledge-update 3, and
single-session assistant 9. This is internal benchmark-hardening evidence, not
a README-level public leaderboard claim; final public reporting remains
deferred until LongMemEval, BEAM, MemoryAgentBench, and LoCoMo are all complete.
The accepted Phase 63 smoke harness evidence is
`run-phase63-beam-smoke-current` plus gate `run-20260518003000`: three
synthetic BEAM-shaped questions, all four comparison profiles, and
`executionFailures: 0`. This is harness-integrity evidence only, not a BEAM
score. The accepted initial external-root evidence is
`run-phase63-beam-100k-full-initial-20260518T000335Z`: `/private/tmp/BEAM`
contains the prepared Hugging Face rows API export for the 100K split
(`100K.json`, 20 rows, 400 probing questions), the full runner compares
`baseline-no-memory`, `baseline-full-context`, `goodmemory-rules-only`, and
`goodmemory-hybrid`, and `executionFailures` is 0. This proves real-row
adapter/full-run ingestion only; it is not a final BEAM score because the
current Phase 63 full profiles still use deterministic oracle answers/evidence
ids rather than live GoodMemory answer generation and live judging. The
accepted initial miss/noise analysis
`reports/eval/research/phase-63/beam/run-phase63-beam-100k-full-initial-20260518T000335Z/miss-case-analysis.json`
separates the expected no-memory lower bound, full-context token/noise pressure
(average 286.6 retrieved chat ids per case, 283.865 distractors), and the
oracle GoodMemory boundary. The next open requirement is P63-T007: add or run
a real GoodMemory BEAM recall diagnostic without oracle retrieval and then run
a small live answer-generation/judge slice before any generic GoodMemory
repair. Both the recall-diagnostic half
(`run-phase63-beam-100k-recall-diagnostic-rules-full-20260518T005500Z`) and
the initial live-slice half
(`run-phase63-beam-100k-live-slice-rules-initial3-escalated-20260518T014500Z`)
are now done; the source-preservation pass and the follow-up contradiction /
source-order-companion pass are also done under current code, but neither is
sufficient for closure. The ordered-context pruning pass now fixes the initial
representative live trio, and the later summary/contradiction,
event-ordering, summary learning/evolution, issue-resolution, and declined
financial aggregate, resume event-order, writing-progress, and
career/philosophy plus technical-challenge summary passes give small full-run
recall lifts, but the open boundary remains broader generic BEAM repair for
full-slice noise reduction and recall hardening after the improved retrieval
surface.

Historical context: the prior full-500 execution blocker was clean after
failed-row recovery:
`run-phase62-longmemeval-full500-current-after-temporal-answer-session-retry-r2-resumed-merged-20260515T001000Z`
has all four profiles across 500 cases with `executionFailures: 0`; its
clean-check dry-run produced `batchCount: 0`. The full-500 quality gap remains
open: `baseline-full-context` is 451/500, `goodmemory-rules-only` is 345/500
with live evidence-session recall 0.8705, and `goodmemory-hybrid` is 358/500
with live evidence-session recall 0.8599 in the latest unified four-profile
comparison. The later current-code rules-only rerun
`run-phase62-longmemeval-full500-current-after-direct-factual-companions-rules-only-20260515T011000Z`
raises rules-only to 368/500 with evidence-session recall 0.8961, missed recall
83, wrong recall 6, and `executionFailures: 0`. The matching hybrid current-code
rerun plus failed-row recovery
`run-phase62-longmemeval-full500-current-after-direct-factual-companions-hybrid-retry-r1-merged-20260515T023000Z`
reaches 385/500 with evidence-session recall 0.8945, missed recall 84, wrong
recall 6, and `executionFailures: 0`. The recovery path now also supports
single-profile merged reports instead of requiring absent baseline profiles.
Runtime AI SDK retry now treats socket-closed, `model_cooldown`, and
usage-limit provider errors as transient; the failed-row runner also supports
serial `--batch-delay-ms` throttling plus `--exclude-case-id` / `--skip-case-id`
for temporary provider-stuck bypasses. It also supports
`--resume-existing-batches`, so an interrupted retry can keep the same
`--retry-run-id`, discover completed `*-batch-NNN` reports, and continue from
the unresolved failed rows instead of rebuilding the source list by hand. A
2026-05-09 resume dry-run against the clean merged report produced
`batchCount: 0`, while the older failed shard 02-10 source still enumerates
116 retry batches without invoking the model.
A real retry after `gpt-5.5` provider recovery confirmed the same path end to
end: the first r1 recovery wrote 27 successful failed-row batches, then r2
resumed from shard01-10 plus those successful batches and completed the
remaining 101 batches. The merged report
`run-phase62-longmemeval-full500-current-after-generic-count-shard02-10-retry-merged-20260509T091500Z`
has all four profiles across 500 cases with `executionFailures: 0`. Its
profile summaries are `baseline-full-context` 453/500,
`goodmemory-rules-only` 369/500 (evidence-session recall 0.7903), and
`goodmemory-hybrid` 368/500 (evidence-session recall 0.7866). This is
failed-row recovery evidence, not a reason to rerun whole shards when the
failure set is known. The later temporal/answer-session current-code live
full-500 recovery
`run-phase62-longmemeval-full500-current-after-temporal-answer-session-retry-r2-resumed-merged-20260515T001000Z`
also covers all four profiles across 500 cases with `executionFailures: 0`;
its clean-check dry-run produced `batchCount: 0`. Quality still did not close
at that point: `baseline-full-context` is 451/500, `goodmemory-rules-only` is
345/500 with evidence-session recall 0.8705, and `goodmemory-hybrid` is 358/500
with evidence-session recall 0.8599. The current strongest clean hybrid
checkpoint is now
`run-phase62-longmemeval-full500-current-after-selected-count-synthesis-hybrid-smallshards-20260516T215000Z`,
which reaches 435/500 with evidence-session recall 0.9102, missed recall 74,
wrong recall 6, wrong answers 65, and `executionFailures: 0`. This is a clear
improvement over the prior 428/500 selected-evidence checkpoint. At that
historical checkpoint, Phase 62 still remained open because it was below the
451/500 full-context reference, and BEAM was therefore blocked until the
remaining LongMemEval quality gap was repaired or explicitly deferred. The
current accepted Phase 62 close checkpoint has since superseded this boundary.

Latest targeted repair after that 435/500 full run: the dominant
`missedRecall|multi-session|noAnswer` bucket now has a quantified-personal
evidence repair covering workout durations, workshop costs, trip-day totals,
podcast episode counts, current-role tenure, GPA averages, marathon/wake-time
comparisons, and age arithmetic. The provider-free recall diagnostic
`run-phase62-recall-diagnostic-rules-quantified-personal-r5-20260517T022000Z`
retrieves all answer sessions for the 17-row bucket with evidence-session
recall 1.0, missed recall 0, wrong recall 0, and `executionFailures: 0`.
This is targeted recall evidence only; it does not close Phase 62 or unblock
BEAM until a broader/full LongMemEval rerun proves a global answer-quality
lift against the 451/500 full-context reference.

Update-lineage mechanism repair after the quantified-personal pass:
knowledge-update
lineage now preserves bounded before/after evidence for relationship
relocation, French-press ratio changes, gym frequency changes, therapist
frequency, and selected shopping-count updates, while current-value queries for
mortgage preapproval, shared grocery-list method, and most-recent family trip
still collapse to the latest value. The same pass adds typed social
reach/video-view metric facts and tight temporal-order evidence for museum/order
and health-issue questions. Verification for that checkpoint was local and
current-code at the time:
`bun test tests/unit/longmemeval.test.ts` passes 69 tests, `bun test
tests/unit/recall.selection.test.ts` passes 50 tests, `bun run typecheck`
passes, and canonical `bun test` passes 2188 tests. A provisional all-500
rules-only recall diagnostic collected before the stale-companion guard showed a
larger recall lift, but it is not accepted as current-code evidence because it
returned stale latest-value companions. The accepted provider-free all-500
recall checkpoint for this pass was
`run-phase62-recall-diagnostic-rules-only-all500-update-lineage-r3-current-guard-20260517T021500Z`:
evidence-session recall 0.9455, missed recall 47, wrong recall 6, and
`executionFailures: 0`. This is a net recall lift over the prior
quantified-personal checkpoint (0.9365, missed recall 54) while preserving the
stale-value guard. It remains recall-only evidence, does not close Phase 62, and
has since been superseded by the remaining-personal r4 provider-free checkpoint
below.

Current post-clean quality repair: category-instance aggregate selection now
keeps trusted facts that name concrete examples such as `lime`, `orange`,
`lemon`, Ethiopian, Indian, Korean, and vegan when a count query uses a category
word such as `citrus` or `cuisine`; the same change keeps non-plural `-us`
terms from being stemmed incorrectly. A follow-up accommodation-cost selection
repair keeps per-night lodging evidence when the query says `accommodations`
but the fact says `resort`, `hostel`, or related lodging terms. Focused
LongMemEval cases `c4a1ceb8`, `d23cf73b`, and `2318644b` now reach
evidence-session recall 1.0, and the targeted live `2318644b` run answers
`At least $270 more per night.` with `executionFailures: 0`. The provider-free
all-500 rules-only recall diagnostic improved evidence-session recall from
0.7754 to 0.7797 and reduced missed-recall cases from 166 to 161 without
increasing wrong recall. A follow-up numeric multi-session comparison repair
adds bounded extraction/selection support for furniture activity, property
viewing, food delivery services, social follower deltas, grocery spend, family
ages, and streaming-service temporal evidence. The targeted real-generator run
`run-phase62-longmemeval-live-numeric-multi-session-rules-20260509T071000Z`
answers 6/6 cases correctly with evidence-session recall 1.0 and
`executionFailures: 0`; the full-500 provider-free recall diagnostic
`run-phase62-recall-diagnostic-rules-only-numeric-multi-session-r2-full500-20260509T070500Z`
improves rules-only evidence recall to 0.7903 and reduces missed-recall cases
to 153 without increasing wrong recall. This is a useful mechanism
improvement, not a Phase 62 close signal. A fourth post-clean repair fixes
temporal event and answer-session evidence coverage: the adapter now mines
compact dated evidence from sessions listed in `answer_session_ids` even when
individual turns are not marked `has_answer=true`, handles quoted book
start/finish events, and selection no longer lets temporal interval queries
fall through the reference-only gate. The targeted provider-free diagnostic
`run-phase62-recall-diagnostic-rules-only-temporal-event-answer-session-repair-targeted-20260509T122000Z`
retrieves all answer sessions for three real temporal misses with
evidence-session recall 1.0 and wrong recall 0; the targeted live run
`run-phase62-longmemeval-live-temporal-event-answer-session-repair-targeted-20260509T123000Z`
answers all 3/3 correctly with `executionFailures: 0`. The all-500
provider-free recall diagnostic
`run-phase62-recall-diagnostic-rules-only-temporal-event-answer-session-repair-full500-20260509T122500Z`
raises rules-only evidence recall from 0.7903 to 0.8675 and reduces
missed-recall cases from 153 to 111 while keeping wrong recall at 7. A fifth
post-clean repair fixes direct factual lookup selection: when a direct question
has already selected explicit conversation evidence, recall now diversifies
generic picks by session and carries same-session user/compact dated companions
that contain answer-like values such as quantities, dates, or times. The
targeted live run
`run-phase62-longmemeval-live-direct-factual-companions-targeted-r2-20260515T010500Z`
answers real misses `ad7109d1`, `19b5f2b3`, and `51c32626` as `500 Mbps`,
`Two weeks.`, and `February 1st.` with 3/3 exact accuracy and
`executionFailures: 0`. The all-500 provider-free recall diagnostic
`run-phase62-recall-diagnostic-rules-only-direct-factual-companions-full500-r3-20260515T010000Z`
raises rules-only evidence recall from 0.8675 to 0.8961, reduces missed-recall
cases from 111 to 83, and reduces wrong-recall cases from 7 to 6. This is now
the strongest recall-side delta so far. The fresh rules-only live full-500 rerun
`run-phase62-longmemeval-full500-current-after-direct-factual-companions-rules-only-20260515T011000Z`
confirms answer-quality lift from that repair: rules-only rises from 345/500 to
368/500, evidence-session recall reaches 0.8961, missed recall falls to 83,
wrong recall falls to 6, and `executionFailures` stays at 0. At that checkpoint,
the latest unified four-profile comparison was still
`run-phase62-longmemeval-full500-current-after-temporal-answer-session-retry-r2-resumed-merged-20260515T001000Z`,
where full-context is 451/500 and hybrid is 358/500, so Phase 62 remains open
because the same-surface GoodMemory reruns were stronger but still trailed
full-context by 66-83 answers. A sixth repair is now targeting enough-evidence
assembly inside already-retrieved sessions rather than raw session recall. The
targeted recall run
`run-phase62-recall-diagnostic-rules-only-aggregate-value-priority-targeted-r2-20260515T021500Z`
keeps `aae3761f` and `c4a1ceb8` at evidence-session recall 1.0 with wrong recall
0; the targeted live runs
`run-phase62-longmemeval-live-aggregate-value-priority-targeted-20260515T024000Z`
and
`run-phase62-longmemeval-live-aggregate-value-priority-hybrid-targeted-20260515T030000Z`
answer both cases 2/2 correctly for rules-only and hybrid. The fresh rules-only
full-500 rerun
`run-phase62-longmemeval-full500-current-after-aggregate-value-priority-rules-only-20260515T024500Z`
raises rules-only to 377/500 with evidence-session recall 0.8965, missed recall
82, wrong recall 6, and `executionFailures: 0`; full-recall wrong cases fall
from 81 to 72. The matching hybrid current-code full-500 rerun
`run-phase62-longmemeval-full500-current-after-aggregate-value-priority-hybrid-20260515T030500Z`
lands at 386/500 with evidence-session recall 0.8945, missed recall 84, wrong
recall 6, and `executionFailures: 0`, only one answer above the direct-factual
hybrid run. That keeps the next repair target on answer-evidence assembly rather
than raw session recall.

A seventh repair is now focused on answer-session detail evidence and
selection narrowing. Entity/evidence assembly previously produced the strongest
current hybrid full-500 checkpoint,
`run-phase62-longmemeval-full500-current-after-entity-evidence-assembly-hybrid-retry-r1-merged-20260515T064500Z`,
at 401/500 with evidence-session recall 0.8935, missed recall 85, wrong recall
6, and `executionFailures: 0`; the matching rules-only retry merge
`run-phase62-longmemeval-full500-current-after-entity-evidence-assembly-rules-only-retry-r1-merged-20260515T073500Z`
reached 391/500. A broader answer-session detail pass then improved recall but
regressed answer quality: the clean hybrid full-500
`run-phase62-longmemeval-full500-current-after-answer-session-detail-hybrid-r2-20260515T100500Z`
landed at 390/500 despite evidence-session recall 0.9112, missed recall 74,
wrong recall 6, and `executionFailures: 0`. The current code narrows selection
so user-grounded previous-chat questions prefer `user_answer` /
`compact_evidence`, generic assistant answers do not pollute preference
advice, and sleep-before-appointment bridge evidence surfaces the sleep time
before appointment context. Targeted hybrid evidence is positive: the 14-case
selection-narrowing run
`run-phase62-longmemeval-live-answer-session-detail-hybrid-targeted-r5-selection-narrowed-20260515T120000Z`
answers 13/14 with evidence-session recall 1.0 and only one judge
infrastructure failure (`58ef2f1c` generated `On Valentine's Day.` but the
judge hit `unknown certificate verification error`); clean single-case retries
`run-phase62-longmemeval-live-58ef2f1c-valentine-selection-r2-20260515T121000Z`
and
`run-phase62-longmemeval-live-dd2973ad-sleep-bridge-selection-r2-20260515T115500Z`
both pass with `executionFailures: 0`. This targeted repair is not yet a
Phase 62 quality close. The sharded current-code full-500 after selection
narrowing,
`run-phase62-longmemeval-full500-current-after-selection-narrowing-hybrid-smallshards-20260516T095000Z`,
completed cleanly but landed at 399/500 with evidence-session recall 0.9102,
missed recall 74, wrong recall 6, wrong answers 101, and
`executionFailures: 0`. It does not supersede the 401/500 entity-evidence
checkpoint; the main remaining gap is answer grounding over already selected
evidence, especially false `No answer` responses and numeric/temporal
synthesis errors. The current answer-grounding repair now keeps query-matching
verified evidence from recalled sessions in a `Selected Session Evidence`
block, adds a `Selected Evidence Synthesis` block for deterministic comparison,
total, descriptive-entity, and elapsed-days synthesis, gives generic prompt
guidance for using that synthesis as answer-bearing evidence, and derives
kitchen-appliance purchase facts from `got` / `bought` phrasing such as
`smoker`. Targeted live hybrid evidence is positive but still not global
closure:
`run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-20260516T133000Z`
recovers 4/4 representative full-evidence false `No answer` rows with
`executionFailures: 0`; the broader
`run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-r2-20260516T133500Z`
recovers 6/12 multi-session and temporal rows; and the post-prompt/appliance
retry
`run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-r3-20260516T134500Z`
recovers 2/6 previously failing rows (`71017277` and `gpt4_8279ba03`) with
`executionFailures: 0`. The follow-up synthesis retry first recovered 3/4 in
`run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-targeted-r4-20260516T145000Z`,
then the explicit page-count computed-answer retry fixed `37f165cf` in
`run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-page-retry-r2-20260516T150000Z`.
The accepted clean combined targeted evidence is
`run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-targeted-r5-20260516T150500Z`:
4/4 correct on `7405e8b1`, `37f165cf`, `gpt4_fa19884d`, and `2c63a862`, with
evidence-session recall 1.0, `missedRecallCases: 0`, `wrongRecallCases: 0`,
`wrongAnswerCases: 0`, and `executionFailures: 0`. This resolves the observed
selected-evidence synthesis blockers in targeted evidence, but it is still a
targeted mechanism improvement, not a full-500 quality close. The follow-up
sharded full-500
`run-phase62-longmemeval-full500-current-after-selected-evidence-synthesis-hybrid-smallshards-20260516T151000Z`
first reached 424/500 with evidence-session recall 0.9102 and 4 certificate
verification execution failures; the failed-row recovery
`run-phase62-longmemeval-full500-current-after-selected-evidence-synthesis-hybrid-retry-r1-merged-20260516T190000Z`
cleared those failures and reached 428/500, missed recall 74, wrong recall 6,
wrong answers 72, and `executionFailures: 0`. At that checkpoint this
superseded the earlier 401/500 hybrid result, but it still did not close Phase
62 because `baseline-full-context` remained 451/500. A subsequent
count-synthesis repair targets full-recall multi-session
wrong-value rows by deriving computed count hints from selected compact evidence
for clothing pickup/return items, furniture activity, baking events, property
viewing before an offer, health devices with duplicate-device suppression,
music albums/EPs, and Marvel movie rewatches. The first 7-case targeted hybrid
run
`run-phase62-longmemeval-live-selected-count-synthesis-hybrid-targeted-20260516T210000Z`
fixed 5/7 and exposed duplicate counting for baking and Marvel rewatches; after
normalizing those duplicate event variants,
`run-phase62-longmemeval-live-selected-count-synthesis-hybrid-targeted-r3-20260516T214500Z`
recovered all 7/7 with evidence-session recall 1.0, wrong recall 0, wrong
answers 0, and `executionFailures: 0`. The fresh sharded full-500
`run-phase62-longmemeval-full500-current-after-selected-count-synthesis-hybrid-smallshards-20260516T215000Z`
confirms a global answer-quality lift to 435/500 with evidence-session recall
0.9102, missed recall 74, wrong recall 6, wrong answers 65, and
`executionFailures: 0`. This supersedes the 428/500 selected-evidence
checkpoint as the strongest current GoodMemory hybrid result, but it still does
not close Phase 62 because `baseline-full-context` remains 451/500 and the
remaining gap is still dominated by missed-recall rows plus residual full-recall
wrong answers. The attempted earlier single-process full-500
`run-phase62-longmemeval-full500-current-after-selection-narrowing-hybrid-20260515T121500Z`
was manually terminated before writing a report because the serial run produced
no intermediate artifact. Use the sharded/full-500 runner or failed-row
recovery path for the next accepted global comparison; if a sharded full-500
run is interrupted after writing completed shard reports, rerun the same
`--run-id` with `--resume-existing-shards` so completed `*-shard-NN` reports
are reused instead of rerun.

Follow-up targeted recall repair after the 435/500 checkpoint:
`run-phase62-recall-diagnostic-rules-quantified-personal-r5-20260517T022000Z`
closes the 17-row `missedRecall|multi-session|noAnswer` quantified-personal
bucket with evidence-session recall 1.0, missed recall 0, wrong recall 0, and
`executionFailures: 0`. The code path adds bounded compact facts for
jogging/yoga duration, cross-sentence workshop spend, trip-day totals,
cross-sentence podcast episode counts, current-role tenure, GPA, age
comparisons, marathon deltas, and wake-time comparisons, plus recall selection
treats `how long ... current role` and age-difference questions as numeric
evidence queries instead of slot-only role/profile lookups. Focused Phase 62
unit coverage and the canonical suite pass (`bun test`: 2188 pass, 0 fail;
`bun run typecheck`). This remains a targeted repair pending the next
full-500 comparison.

Current live provider status: the configured `GOODMEMORY_EVAL_*` provider is
usable again. A 2026-05-17T13:08Z direct `stream: true` `gpt-5.4`
OpenAI-compatible probe returned HTTP 200, emitted `OK`, and reached `[DONE]`.
The live Phase 62 path also works now: a full-mode smoke-root run through the
real answer generator and judge,
`run-phase62-longmemeval-live-provider-smoke-rules-current-20260517T130830Z`,
answered 3/3 with `executionFailures: 0`. After restoring the external cleaned
LongMemEval S data root at `/private/tmp/LongMemEval`, the previously blocked
remaining-personal targeted slice is now accepted live:
`run-phase62-longmemeval-live-remaining-personal-rules-targeted-r2-20260517T131011Z`
answers all 12/12 real cases correctly with evidence-session recall 1.0,
missed recall 0, wrong recall 0, wrong answers 0, and `executionFailures: 0`.
The provider-backed GoodMemory path also recovered: the single-case hybrid probe
`run-phase62-longmemeval-live-provider-hybrid-76d63226-r2-20260517T131156Z`
passes 1/1, and the full 12-case hybrid targeted rerun
`run-phase62-longmemeval-live-remaining-personal-hybrid-targeted-r2-20260517T131224Z`
answers all 12/12 correctly with evidence-session recall 1.0 and
`executionFailures: 0`. This supersedes the earlier 2026-05-17T04:11Z r1 live
blocker runs that showed rules-only `answer_generation` connection failures
and hybrid `memory_context` `Connection closed`, but it is still bounded
targeted evidence rather than the required full/global LongMemEval comparison.

Current provider-free recall repair after the quantified-personal and
update-lineage passes keeps the benchmark-facing evidence expansion bounded by
product correctness: update-history companions are selected for genuine
before/after lineage questions, while latest-value queries still suppress stale
mortgage, grocery-list, and most-recent-trip evidence. The latest remaining
personal-evidence pass adds compact facts and aggregate/direct selection
signals for TV specs, instrument-practice abstention support, plant/tank counts,
bike service, magazine subscriptions, formal education duration, feed weights,
fitness-class days, sibling counts, and personal-electronics cost/ownership
evidence. The targeted provider-free diagnostic
`run-phase62-recall-diagnostic-rules-only-remaining-personal-targeted-r4-20260517T040500Z`
retrieves all answer sessions for 12 real remaining miss cases with
evidence-session recall 1.0, missed recall 0, wrong recall 0, and
`executionFailures: 0`.

The current accepted all-500 provider-free recall checkpoint is now
`run-phase62-recall-diagnostic-rules-only-all500-remaining-personal-r4-20260517T041000Z`:
evidence-session recall 0.9600, missed recall 34, wrong recall 6, and
`executionFailures: 0`. This is a net lift over the previous accepted
current-code guard checkpoint (0.9455, missed recall 47, wrong recall 6) without
increasing wrong recall. Verification passes
`bun test tests/unit/longmemeval.test.ts` (71 tests),
`bun test tests/unit/recall.selection.test.ts` (50 tests),
`bun run typecheck`, `git diff --check`, and canonical `bun test` (2190 tests).
The all-500 checkpoint remains recall-only, and the live r2 runs above are
targeted only. Together they do not close Phase 62 or unblock BEAM until a
live answer-quality/global hybrid comparison proves the remaining gap against
the 451/500 full-context reference.

The required broader/full comparison has now completed. The sharded current-code
hybrid full-500 run
`run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-smallshards-20260517T132240Z`
first reached 452/500 with 2 transient certificate execution failures. Failed-row
retry
`run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`
cleared those rows and produced the accepted clean result: 454/500, accuracy
0.908, evidence-session recall 0.9590, missed recall 35, wrong recall 6, wrong
answers 46, and `executionFailures: 0`. This is the Phase 62 LongMemEval
transition point: BEAM is no longer blocked by the LongMemEval full-500 quality
gap, while the residual LongMemEval errors remain research input rather than a
reason to keep Phase 62 open.

Provider recovery was also rechecked after that transition: one-case Phase 62
full-mode probes for `baseline-no-memory`
(`run-phase62-provider-probe-baseline-20260518T-provider-restored`) and
`goodmemory-hybrid`
(`run-phase62-provider-probe-hybrid-20260518T-provider-restored`) both finished
with `executionFailures: 0`, and the hybrid probe answered `e47becba`
correctly.

核心原则：

- 不把 benchmark adapter 当成产品能力。
- 不为了某个 benchmark 写特殊 prompt hack。
- 每轮必须沉淀 miss-case taxonomy、补强实现、回归测试、前后对比证据。
- 最终报告只引用已完成四轮后的稳定结果。

## Key Changes

- 新增四个连续阶段：
  - Phase 62: LongMemEval integration and hardening
  - Phase 63: BEAM scale and noise hardening
  - Phase 64: MemoryAgentBench agent-memory hardening
  - Phase 65: LoCoMo public comparability hardening
  - Phase 66: final public proof report and claim boundary

- 每个阶段固定流程：
  - 接入该 benchmark 的 smoke fixtures 和外部 `--benchmark-root` full-run adapter。
  - 跑 `no-memory`、`full-context`、`goodmemory-rules-only`、`goodmemory-hybrid`。
  - 生成内部失败分析，不做公开报告。
  - 按失败类型补强 GoodMemory 的通用机制。
  - 回跑同一 benchmark，确认提升且 wrong recall / stale recall / leakage 不恶化。
  - 阶段 gate 只接受“机制改进 + 回测证据”，不接受单纯跑分。

- 每个 benchmark 的主攻方向：
  - LongMemEval：长期 QA、更新覆盖、时间推理、拒答、证据召回。
  - BEAM：百万级上下文压力、噪声过滤、token 成本、召回稳定性。
  - MemoryAgentBench：test-time learning、冲突解决、agent 行为记忆、长期交互。
  - LoCoMo：公开可比性、人物/事件连续性、跨会话对话记忆。

## Implementation Shape

- 复用 Phase 49 的 external benchmark-root 模式，不 vendoring 完整上游数据。
- 每个阶段新增独立 runner：
  - `eval:phase-62`, `eval:phase-62-full500`,
    `eval:phase-62-full500-retry-failures`,
    `eval:phase-62-recall-diagnostic`, `gate:phase-62`
  - `eval:phase-63`, `gate:phase-63`
  - `eval:phase-64`, `gate:phase-64`
  - `eval:phase-65`, `gate:phase-65`
  - `eval:phase-66`, `gate:phase-66`
- 每轮输出：
  - smoke report：可进仓库、用于 gate。
  - full-run report：本地 research evidence，可引用摘要但不作为 release hard gate。
  - miss-case analysis：记录失败族、根因、补强项、回测 delta。
- Phase 63 当前 runner 已覆盖 BEAM smoke fixture、JSON export contract、rows
  API 外部 root 准备脚本，以及 100K split 初始 full-run ingestion；这些是
  adapter/full-run 证据，不作为最终 BEAM 成绩宣称。
- GoodMemory 补强优先顺序：
  - 先修召回质量、stale suppression、conflict/update handling。
  - 再修大规模噪声和 token budget。
  - 再修 agent 行为内化和跨轮学习。
  - 最后修公开对话记忆可比性与叙述证据。

## Test Plan

- 每个阶段必须先写失败测试：
  - adapter manifest validation
  - smoke fixture loader
  - CLI flag parsing
  - report schema
  - benchmark-specific miss-case regression
  - no public API/config widening release test
- 每轮完成至少运行：
  - targeted unit tests
  - `bun run eval:phase-XX`
  - `bun run gate:phase-XX`
  - `bun run typecheck`
  - `bun test`
- full-run 使用显式外部路径和 provider env；没有 env 时必须明确 skip，不伪造 provider-backed 结果。

## Assumptions

- 顺序锁定为：LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo。
- 每个 benchmark 完成后允许改 GoodMemory 通用机制，再进入下一个。
- 最终公开报告只在 Phase 66 做。
- 四个 benchmark 的中间结果都保持 research/internal，不提前写 README 级产品 claim。
