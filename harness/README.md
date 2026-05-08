# bouncer-md Agent Test Harness

## 1. What This Is

The harness is an end-to-end integration validator for the bouncer-md reference resolver. It runs a three-agent code-review scenario — orchestrator, analyzer, and documenter — using real LLM calls and stub tool implementations, then asserts that bouncer controls produce the correct IR, audit records, and enforcement decisions. Adversarial inputs test that prompt injection, secret exfiltration, tool chaining, and instruction override attempts are blocked as the spec requires. Integration runs require an LLM API key; unit tests run entirely without one.

## 2. Prerequisites

- Node.js 22+
- An API key for a supported provider (Anthropic or OpenAI)
- Resolver built before running `npm install`:
  ```bash
  cd ../resolver && npm install && npm run build
  ```
- The `bouncer lint` CLI is available after the resolver is installed (via `npx bouncer lint` or after `npm install -g` in `resolver/`)

## 3. Setup

```bash
cd harness
npm install
cp .env.example .env
# Edit .env — add your API key
```

## 4. Environment Variables

All variables listed below must appear in `.env.example`. Variables not listed here are not read by the harness.

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOUNCER_LLM_PROVIDER` | No | `anthropic` | LLM provider: `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | If provider=anthropic | — | Anthropic API key |
| `OPENAI_API_KEY` | If provider=openai | — | OpenAI API key |
| `OPENAI_BASE_URL` | No | — | Override for Azure OpenAI or compatible endpoints |
| `BOUNCER_LLM_MODEL` | No | Provider default | Override model name (e.g. `claude-sonnet-4-6`, `gpt-4o`) |
| `BOUNCER_HARNESS_VERBOSE` | No | `false` | Print full IR and audit records on every scenario |

## 5. Running the Harness

**Unit tests — no API key required:**
```bash
npm test
```
These run in CI on every push. All unit tests must pass without any environment variables set.

**Full integration suite (Slice 2):**
```bash
npm run harness
```
Runs the clean scenario and all adversarial scenarios. Prints a report to stdout.

**Clean scenario only:**
```bash
npm run harness:clean
```

**Adversarial scenarios only:**
```bash
npm run harness:adversarial
```

**Verbose output — full IR and audit records on every scenario:**
```bash
BOUNCER_HARNESS_VERBOSE=true npm run harness
```

> **Note:** Integration scenario scripts (`harness`, `harness:clean`, `harness:adversarial`) are added in Slice 2. Only `npm test` is available in the current build.

## 6. Reading the Report

The report has five sections:

**Header** — timestamp, provider name, model, and resolver version. Use this to reproduce a run.

**Clean Scenario** — result of a single resolver call with a benign code snippet. PASS means the IR is valid, audit records are complete, and tool invocations match expectations. FAIL includes the full IR JSON and audit records.

**Adversarial Scenarios** — one line per input, grouped by category. PASS means the resolver returned `block`, the targeted tool was not invoked, and an audit record confirms the enforcement decision. FAIL includes the full IR JSON, invocation log, and the specific assertion that failed.

**Summary** — total scenario count, passed, and failed. One clean scenario plus all adversarial scenarios.

**Known Stubs** — always present. Lists behaviors that are stubbed rather than fully implemented:
- `bouncer.detected_conditions` is always `[]` — runtime condition evaluation is deferred to issue #46. This is expected and not a failure.
- OTel span emission is stubbed — pending SIG validation, issue #46.

## 7. What to Do With Failures

**Clean scenario failure** — the resolver, audit pipeline, or IR is broken. The full IR JSON and audit records appear in the report. File a bug against the resolver before sharing the report with any partner.

**Adversarial scenario PASS that should have been a FAIL** — a control that should have blocked an adversarial input didn't. Check:
1. Whether the bouncer file in `harness/bouncer/` correctly expresses the control
2. Whether the resolver IR has the right `resolved_outcome`
3. Whether the assertion logic in `assertions/index.ts` is correct
File a spec issue if the control language is ambiguous, or a resolver issue if the IR is wrong.

**Adversarial scenario FAIL that should have been a PASS** — an input that should have passed was blocked. Check whether the control is over-broad. This is a bouncer file authoring issue, not a resolver bug.

**`bouncer.detected_conditions` is always `[]`** — this is expected. See Known Stubs above.

## 8. Adding a Provider

1. Create `providers/your-provider.ts` implementing the `LlmProvider` interface from `providers/types.ts`
2. Add a `case "your-provider":` branch to `providers/factory.ts`
3. Add `YOUR_PROVIDER_API_KEY` to `.env.example` and the table in section 4 of this README
4. Run unit tests — `providers.test.ts` uses a mock and will still pass without touching your implementation
5. Run `npm run harness` to validate end-to-end behavior

The `LlmProvider` interface requires two methods:

```typescript
complete(messages: Message[], systemPrompt: string): Promise<LlmResponse>
completeWithTools(messages: Message[], systemPrompt: string, tools: ToolDefinition[]): Promise<LlmResponse | ToolCall>
```

No harness logic changes when adding a provider. All scenario and assertion code is provider-agnostic.

## 9. Adding an Adversarial Scenario

1. Create the input file in the appropriate `adversarial/` subdirectory (e.g. `adversarial/prompt-injection/my-new-attack.txt`)
2. Add the expected outcome to `expected/adversarial-outcomes.json`
3. Document the attack vector and target control in `adversarial/README.md`
4. Run `npm run harness:adversarial` to verify the scenario passes

Adversarial inputs are plain text files. They are injected as user input or as tool results depending on the attack vector. See `adversarial/README.md` for the catalog of current inputs and the injection point for each.

## 10. Known Limitations

- `bouncer.detected_conditions` is always `[]` — runtime condition evaluation is deferred, see issue #46
- OTel span emission is stubbed — pending SIG validation, see issue #46
- `bouncer.enforcement_path` is a heuristic based on `priority: immutable`, not a verified Path B indicator
- Path B PEP enforcement is not tested here — the harness validates resolver output and audit records only; the PEP is the partner's build
- Integration scenarios (Slice 2) are not yet implemented — only unit tests are available in the current build
