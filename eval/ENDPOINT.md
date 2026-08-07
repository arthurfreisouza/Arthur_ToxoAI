# Hugging Face Inference Endpoint Configuration

Governed by FR-097 through FR-100, SC-003, and research.md R8. This is the endpoint every script
in `eval/` and `Toxo_AI_code/backend_files/services/classifier.py` (T060–T065) talks to. It is
configured once, by hand, after `training_model/finetune_llama32_1b.ipynb` has pushed a model to
the private repository — there is no script here that provisions it, because the plan
deliberately keeps cloud infrastructure changes out of the reproducible-artefact scripts.

---

## Prerequisite

The private repository must already hold a merged model, pushed by the notebook's final cell:
`https://huggingface.co/<your-username>/toxoai-llama32-1b-ft` (or whatever `HF_REPO_ID` resolved
to). Confirm the repo is **private** before continuing — FR-097 is non-negotiable.

---

## Creating the endpoint

Via the Hugging Face UI (**Inference Endpoints** → **New Endpoint**), or the equivalent
`huggingface_hub.create_inference_endpoint()` call:

| Setting | Value | Why |
|---|---|---|
| Repository | `<your-username>/toxoai-llama32-1b-ft` | the private, fine-tuned repo — never the base model |
| Task | Text Generation | |
| Instance type | Smallest GPU instance that fits a 1B model in fp16 (e.g. `nvidia-t4`, 1x) | the model is 1B parameters; nothing larger is needed until the FR-084 ladder escalates |
| Replica autoscaling | Min replicas **0**, max replicas **1** | required for scale-to-zero — SC-014's cost ceiling assumes the endpoint is not billed while idle |
| Scale-to-zero timeout | **15 minutes** | research.md R8's chosen idle window — short enough to bound cost, long enough that a clinic session doesn't repeatedly cold-start |
| Visibility | Private | matches the repository |
| Region | Closest to the production VM | latency, not correctness |

Record the resulting endpoint URL as `HF_ENDPOINT_URL` in `Toxo_AI_code/.env` (see
`.env.example`) and, for the offline harness, as the `--endpoint` argument to `replay.py`,
`heldout.py`, and `determinism.py`.

---

## Decoding parameters — fixed, not per-request

Every call to the endpoint, from every caller (`classifier.py`, `replay.py`, `heldout.py`,
`determinism.py`, `benchmark.py`), MUST use:

```jsonc
{
  "parameters": {
    "temperature": 0,
    "top_p": 1,
    "do_sample": false,
    "max_new_tokens": 64,
    "seed": 42
  }
}
```

This is greedy decoding — layer (a) of research.md R2's two-layer determinism mechanism. It is
necessary but **not sufficient** for SC-016: a hosted endpoint can still return different tokens
for identical input across replicas or a silent runtime upgrade (floating-point non-associativity
in batched attention is enough). Layer (b), the response cache keyed by
`sha256(normalised findings) + model_version + prompt_version + lookup_version`, is what makes
SC-016 hold structurally — see `contracts/classification.md`. Measuring the model's own
determinism (rather than the cache's) requires `X-Bypass-Classification-Cache` on the request to
the application, which in turn calls the endpoint without a cache hit.

`max_new_tokens: 64` is sized for the completion format emitted by `eval/dataset.py`
(`PROMPT_VERSION = "v1"`): a JSON object holding only `mother_classification` and
`child_classification`. If the prompt version changes, re-check this bound.

---

## Cold start — a first-class state, not an error

Scale-to-zero means the first request after 15 idle minutes pays a cold-start cost. FR-099 and
FR-100 require the application to treat this explicitly:

- The endpoint reports `scaledToZero` or `initializing` while warming up.
- The classification endpoint (`POST /api/v1/classify`, T064) must accept the request, persist
  the submitted findings against a job id, and return `202 {"job_id", "state": "model_starting"}`
  within 2 seconds of the request arriving — never a silent hang.
- Total wait is bounded at **180 seconds**. Past that bound, `GET /classify/{job_id}` returns
  `502` with an explicit failure (FR-040) — never a fabricated or ungrounded fallback answer.

`eval/determinism.py` and `eval/replay.py` should expect and tolerate a `202` on their first call
after any period of endpoint inactivity, and poll until `complete` or the 180 s bound.

---

## Verifying the endpoint before trusting any evaluation result

```bash
curl -X POST "$HF_ENDPOINT_URL" \\
  -H "Authorization: Bearer $HF_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "inputs": "<a chat-templated prompt from eval/dataset.py PROMPT_VERSION v1>",
    "parameters": {"temperature": 0, "top_p": 1, "do_sample": false, "max_new_tokens": 64, "seed": 42}
  }'
```

Expect a JSON completion of the shape `{"mother_classification": "...", "child_classification":
"..."}`, with both values inside the permitted sets in
[data-model.md §3](../specs/001-toxo-graphrag-assistant/data-model.md#3-classification-contract-data).
Anything else — free text, a truncated JSON object, a value outside the permitted sets — means the
endpoint or the prompt template has drifted from what the model was trained on, and no downstream
script (`replay.py`, `heldout.py`, `benchmark.py`) should be trusted until it is fixed.
