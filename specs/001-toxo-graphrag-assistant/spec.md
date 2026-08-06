# Feature Specification: Congenital Toxoplasmosis Clinical Knowledge Assistant

**Feature Branch**: `001-toxo-graphrag-assistant`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Technical specification for the web application at mychatbotproject.uk. Sole administrator; authenticated doctors are the primary users. Doctors submit prompts about congenital toxoplasmosis. The system uses a fine-tuned LLM combined with GraphRAG. The knowledge base is built from the documents in `logs/` and the project thesis (`monografia.pdf`). Cover: system overview and architecture, user roles and authentication, data ingestion and processing, the core prompt lifecycle, and cost-effective tech stack recommendations."

---

## Overview

`mychatbotproject.uk` becomes a closed, invitation-only clinical decision-support tool for doctors managing suspected congenital toxoplasmosis. A doctor signs in and either submits a patient's findings to receive a classification with its reasoning, or asks a free-text question and receives an educational answer. Both are grounded in — and visibly attributed to — a single curated body of knowledge: the project thesis and the historical set of classified clinical case records.

This changes the current model of the product in three structural ways, all deliberate and all with governance consequences settled in constitution v2.0.0 (see **Constitution Impact** below):

1. **The system classifies patients.** It no longer only educates. A doctor submits findings and receives a maternal classification, a child classification, an argumentation, and a recommendation for that patient, captured as training data for a future model.
2. **The knowledge base becomes shared and curator-owned rather than per-user.** Today every user uploads their own documents into their own private index. Here, one authoritative corpus is curated by the Administrator and read identically by every doctor, which is what makes a classification reproducible. Doctors do not upload.
3. **Retrieval becomes graph-based rather than purely similarity-based.** The corpus contains a structured, highly relational dataset (serological markers → maternal classification → child classification → recommendation). Reaching the cases that resemble a submitted patient requires traversing those relationships, not just matching text.

### What is deliberately out of scope

- Doctors uploading their own documents or building private knowledge bases.
- Multi-tenant or multi-institution separation; there is one corpus and one administrator.
- Mobile-native applications; a responsive browser experience is sufficient.

### What this system is

Per the Session 2026-08-06 clarification below, this is a **diagnostic decision-support classifier**, not a reference tool. A doctor supplies a patient's clinical and serological findings; the system returns a maternal classification, a child classification, an argumentation, and a recommendation for **that patient**, and captures the input/output pair as training data for a future model. The clinical-safety requirements (FR-042 onward) and the regulatory position (see Assumptions) are written for that posture.

---

## Clarifications

### Session 2026-08-06

- Q: When a doctor describes a specific patient's serological results, should the assistant tell them which classification that patient falls into, or only report how similar past cases were classified? → A: Option C — the system classifies the patient. The doctor supplies the patient's findings; the chatbot acts as the classifier and returns the maternal classification, child classification, argumentation, and recommendation for that patient, as an aid to diagnosis. Each input/output pair is persisted to `new_outputs.csv` as training data for a future model.
- Q: Should the classification be computed by deterministic rules, with the LLM handling conversation and explanation, or should the fine-tuned LLM produce the classification itself? → A: Option B — the fine-tuned LLM produces the classification, using GraphRAG over a Neo4j knowledge graph. The assistant both diagnoses and educates: it classifies the patient and explains the reasoning behind that classification. Neo4j is a fixed architectural constraint, not a recommendation to be revisited at planning.
- Q: Should the system accept and store direct patient identifiers alongside the clinical findings, or only the de-identified findings it needs to classify? → A: Option A — de-identified findings only. The system never requests a direct identifier, detects any present in free text, and strips them on the write path so none reach conversation history or the training dataset.
- Q: Which language should the assistant reply in — the language the doctor wrote in, always Portuguese, or always English? → A: Option A — reply in the doctor's language, while always displaying the canonical Portuguese classification, argumentation, and recommendation text verbatim alongside any translation, so the clinical wording stays auditable and identical to the dataset.
- Q: Should doctors still be able to upload their own documents, as the current live system allows, or does that feature get removed in favour of the single curated knowledge base? → A: Option A — one curated corpus, curated by the Administrator alone. Doctors must not be able to upload files. The existing per-user upload capability in the deployed system is retired.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Doctor submits a case and receives a classification with its reasoning (Priority: P1)

An authenticated doctor describes a patient — maternal serology across the sampling points, gestational timing, the child's serology, and the fundoscopic, neuroimaging and PCR findings — either in prose or through guided fields. The system determines the maternal classification and the child classification for that patient, and returns them together with an argumentation explaining why those classifications follow from the findings, and a recommendation for next steps. The explanation is grounded in the knowledge graph and cites the thesis passages and comparable historical cases that support it. Where the findings fall outside the parameterised rules, the system says so explicitly instead of forcing a classification.

**Why this priority**: This is the product. The doctor's reason for opening the tool is to get a classification for the patient in front of them, with reasoning they can check.

**Independent Test**: Replay the 24 historical cases through the system and compare the returned maternal classification, child classification, argumentation, and recommendation against the recorded outputs. The story passes when the classifications match and each explanation cites material that genuinely supports it.

**Acceptance Scenarios**:

1. **Given** a signed-in doctor and a complete set of findings, **When** they submit the case, **Then** the system returns a maternal classification, a child classification, an argumentation, and a recommendation, each drawn from the permitted value sets.
2. **Given** a submitted case, **When** the classification is returned, **Then** it is accompanied by an explanation that cites the thesis passages and comparable historical cases supporting it, each expandable to read the source.
3. **Given** a case whose findings match a historical record, **When** it is submitted, **Then** the returned classification matches that record's recorded classification.
4. **Given** findings that fall outside the parameterised rules, **When** the case is submitted, **Then** the system reports that no classification could be determined and does not present that outcome as a clinical conclusion.
5. **Given** an incomplete set of findings, **When** the doctor submits, **Then** the system asks for the specific missing findings rather than inferring or defaulting them.
6. **Given** the same findings submitted on two separate occasions, **When** both are classified, **Then** both return the same classification.
7. **Given** a completed classification, **When** it is returned to the doctor, **Then** the submitted findings and the returned output are appended to the training dataset with their timestamp and configuration version.
8. **Given** a returned classification, **When** the doctor reviews it, **Then** they can see which input findings drove the result and can mark it as clinically incorrect.

---

### User Story 2 - Doctor asks a grounded clinical question (Priority: P1)

An authenticated doctor opens the assistant, types a question about congenital toxoplasmosis — either a general one ("how is congenital toxoplasmosis excluded in an asymptomatic newborn?") or a case-shaped one describing a serological profile — and receives a clear answer written in the language they asked in. Every substantive claim carries a visible attribution back to the passage of the thesis or the specific historical case record supporting it, and the doctor can expand any attribution to read the underlying source text.

**Why this priority**: The assistant must educate as well as diagnose. Free-text questions are how a doctor builds the understanding around a classification, and this journey is independently valuable even before a case is submitted.

**Independent Test**: Load the corpus once, sign in as a doctor, and submit a set of questions whose answers are known to be present in the thesis and in the case records. The story passes if the answers are accurate, attributed, and the attributions resolve to the correct source material.

**Acceptance Scenarios**:

1. **Given** an indexed corpus and a signed-in doctor, **When** the doctor asks a factual question whose answer appears in the thesis, **Then** the system returns an answer grounded in that material with at least one attribution the doctor can expand to read the supporting passage.
2. **Given** an indexed corpus and a signed-in doctor, **When** the doctor describes a serological profile resembling historical case records, **Then** the answer references those comparable records, states how they were classified, and reports what was recommended for them.
3. **Given** an indexed corpus, **When** the doctor asks something the corpus does not cover, **Then** the system says plainly that the corpus does not cover it rather than answering from unsourced general knowledge.
4. **Given** an indexed corpus, **When** the doctor asks about a topic unrelated to congenital toxoplasmosis, **Then** the system declines and restates its scope.
5. **Given** a doctor mid-conversation, **When** they ask a follow-up that depends on the previous exchange, **Then** the follow-up is interpreted in the context of that conversation.
6. **Given** the corpus contains sources that disagree, **When** the doctor asks about that point, **Then** the answer surfaces the disagreement and attributes each position rather than silently choosing one.
7. **Given** a doctor writing in a language other than Portuguese, **When** they ask a question or receive a classification, **Then** the reply is in their language, relevant Portuguese source material is still retrieved, and any canonical clinical text is shown verbatim in Portuguese and labelled as translated where a translation appears.

---

### User Story 3 - Administrator curates the knowledge base (Priority: P2)

The administrator adds, replaces, or removes source material and rebuilds the knowledge graph. They can see what is currently indexed, when it was last built, whether the last build succeeded, and what the build extracted — how many entities, relationships, and case records came out of it. A build that fails leaves the previously working knowledge base serving doctors untouched.

**Why this priority**: Story 1 needs a corpus, but the first corpus can be loaded by an operator running a command. This story is what makes the corpus maintainable over time — as the thesis is revised and as new classified cases accumulate — without which the tool decays.

**Independent Test**: As administrator, ingest the thesis and the case-record dataset, inspect the reported build statistics, replace one source with an updated version, rebuild, and confirm doctors' answers reflect the new material and attribute to it.

**Acceptance Scenarios**:

1. **Given** the administrator is signed in, **When** they view knowledge base status, **Then** they see every indexed source, its ingestion time, and the entity, relationship, and case-record counts from the most recent successful build.
2. **Given** a source document, **When** the administrator ingests it, **Then** the system reports progress and a final success or failure with a specific, actionable reason on failure.
3. **Given** a build fails partway through, **When** the administrator checks the system, **Then** the previously indexed knowledge base is still intact and still serving doctors' questions.
4. **Given** a source is removed, **When** the administrator rebuilds, **Then** answers no longer draw on or attribute to that source.
5. **Given** a rebuild is in progress, **When** a doctor asks a question, **Then** they receive an answer from the last good knowledge base without an error or an indefinite wait.
6. **Given** doctors have been using the tool over a period, **When** the Administrator reviews operational history, **Then** they see question volume and failure rates over time without any question or answer content being exposed.

---

### User Story 4 - Administrator controls who gets access (Priority: P2)

Access is closed. The administrator invites a named clinician by email address; only an invited address can complete registration, and the account becomes usable only after the invitee confirms that address. The administrator can see all accounts and revoke any of them, and revocation takes effect promptly rather than at the end of a long-lived session.

**Why this priority**: The tool is aimed at clinicians and answers clinical questions. Open self-registration would put it in front of an unintended audience, which is both a safety problem and a credibility problem. It is P2 rather than P1 only because a hand-provisioned account is enough to validate Story 1.

**Independent Test**: Attempt to register with an uninvited address and confirm rejection. Invite an address, complete registration and email confirmation, sign in successfully, then revoke the account and confirm access stops.

**Acceptance Scenarios**:

1. **Given** an email address that has not been invited, **When** someone attempts to register with it, **Then** registration is refused and no account is created.
2. **Given** an invited address, **When** the invitee registers and confirms the address, **Then** they can sign in and use the assistant.
3. **Given** an invited address whose invitation has expired, **When** the invitee attempts to register, **Then** registration is refused and they are told to request a new invitation.
4. **Given** an active doctor account, **When** the administrator revokes it, **Then** the doctor can no longer sign in and any in-flight session stops being honoured within the stated revocation window.
5. **Given** a signed-in doctor, **When** they attempt any administrative action, **Then** it is refused.

---

### User Story 5 - Doctor revisits and exports prior work (Priority: P3)

A doctor's conversations persist across sessions. They can list past conversations, reopen one and read it with its attributions intact, rename or delete it, and export a conversation as a self-contained document including the questions, the answers, and the sources those answers rested on.

**Why this priority**: Genuinely useful — clinicians revisit reasoning and want a record of what the tool said and why — but Stories 1 through 3 constitute a complete, deployable product without it.

**Independent Test**: Hold a conversation, sign out, sign back in, reopen the conversation, verify the content and attributions survived, and export it.

**Acceptance Scenarios**:

1. **Given** a doctor with prior conversations, **When** they sign in, **Then** they see their conversations listed most-recent-first with a recognisable title.
2. **Given** a saved conversation, **When** the doctor reopens it, **Then** the full exchange and its attributions are displayed as originally produced, even if the knowledge base has since been rebuilt.
3. **Given** an open conversation, **When** the doctor exports it, **Then** they receive a document containing the exchange, the attributions, and the date the answers were produced.
4. **Given** a doctor's conversation, **When** any other doctor is signed in, **Then** that conversation is neither listed nor reachable for them.
5. **Given** a doctor deletes a conversation, **When** they reload, **Then** it is gone and does not reappear.
6. **Given** an answer the doctor found unhelpful, **When** they mark it as such, **Then** the rating is retained with that answer and is reflected in the aggregate view available to the Administrator.

---

### Edge Cases

**Query handling**

- A question that is out of scope (not about congenital toxoplasmosis) is declined with a restatement of scope rather than answered from general knowledge.
- A question the corpus cannot answer produces an explicit "the corpus does not cover this" rather than a plausible-sounding invention.
- A question too vague to retrieve against prompts for the specific detail needed instead of guessing.
- A question in a language other than the corpus language still retrieves the relevant material and is answered in the language asked.
- An extremely long submission is rejected with a stated limit rather than silently truncated.
- A submission containing instructions aimed at the system itself ("ignore your instructions", "you are now…") is treated as ordinary question text and does not alter the system's behaviour or safety framing.

**Classification**

- Required findings are missing: the system asks for the specific missing findings and does not classify on partial input.
- A finding is supplied with a value outside its permitted set: it is rejected with the permitted values stated, rather than coerced to the nearest match.
- The findings fall outside the parameterised rules: the system reports that no classification could be determined, and this is never rendered as a clinical conclusion.
- The findings are internally contradictory: the contradiction is surfaced to the doctor rather than silently resolved.
- The model returns a classification, argumentation, or recommendation outside the permitted value sets: the response is rejected and the doctor sees an explicit failure, never the invalid output.
- The same findings are submitted twice and yield different classifications: this is a defect, and the system must be built so it cannot occur.
- The training dataset cannot be written: the doctor still receives their classification, and the capture failure is raised to the Administrator rather than silently dropped.

**Patient-identifying information**

- A doctor pastes text containing patient identifiers. The system must not persist those identifiers in conversation history, and must warn the doctor on entry to the tool and at the point of submission. See FR-048 through FR-051.

**Knowledge base state**

- No corpus has been built yet: doctors are told the knowledge base is not ready rather than shown an empty or invented answer.
- A rebuild is running: doctors continue to be served by the last good build.
- A source document is malformed, unreadable, or has an unexpected structure: ingestion fails that source with a specific reason and does not corrupt the existing knowledge base.
- A case record has missing or unparseable fields: it is either ingested with those fields marked absent or skipped with a reported reason — never silently dropped.
- The corpus is thin for a given question and very few records match: the answer states how limited the supporting evidence is.

**Session, access, and availability**

- A session expires while an answer is being generated: the doctor is prompted to sign in again and does not lose the question they submitted.
- An account is revoked mid-session: the next request is refused.
- The language model is unavailable or times out: the doctor sees an explicit failure, never a fabricated answer.
- A doctor submits questions faster than the rate limit permits: further requests are refused with a clear, temporary message.
- Two browser tabs from the same doctor operate on the same conversation: neither corrupts the other's history.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Access, roles, and authentication

- **FR-001**: System MUST support exactly two roles — Administrator and Doctor — and MUST assign every account exactly one of them.
- **FR-002**: System MUST restrict all knowledge-base curation, account administration, and configuration capabilities to the Administrator role.
- **FR-003**: System MUST provide the Doctor role with question submission, conversation management, and export, and MUST refuse it every administrative capability.
- **FR-004**: System MUST refuse registration for any email address that does not hold a valid, unexpired, unused invitation issued by the Administrator.
- **FR-005**: System MUST require an invitee to confirm ownership of the invited email address before the account can be used to sign in.
- **FR-006**: System MUST expire unused invitations after 14 days and MUST allow the Administrator to reissue them.
- **FR-007**: System MUST authenticate sign-in with an email address and a password of at least 12 characters, and MUST reject bad credentials without revealing which element was wrong.
- **FR-008**: System MUST end an idle session after 60 minutes and require re-authentication.
- **FR-009**: System MUST allow the Administrator to revoke any Doctor account, and revocation MUST take effect for new requests within 5 minutes.
- **FR-010**: System MUST allow a doctor to reset a forgotten password through a confirmation sent to their registered address; reset links MUST be single-use and expire within 1 hour.
- **FR-011**: System MUST rate-limit both authentication attempts and question submissions per account, and MUST refuse excess attempts with a clear, temporary message.
- **FR-012**: System MUST record an auditable event for every sign-in, sign-in failure, invitation, revocation, and administrative change to the knowledge base, retaining at least the actor, the action, and the time.

#### Knowledge sources and ingestion

- **FR-013**: System MUST treat the knowledge base as a single shared corpus curated by the Administrator and readable by every Doctor.
- **FR-014**: System MUST NOT permit doctors to add, alter, or remove source material, and MUST NOT expose any upload capability to the Doctor role.
- **FR-082**: System MUST retire the per-user document upload capability present in the deployed application — its endpoints, its user interface, and the per-user document indexes — so that no doctor-supplied file can influence any classification or answer.
- **FR-083**: System MUST ensure a classification depends only on the submitted findings and the curated corpus, never on who submitted it.
- **FR-015**: System MUST ingest narrative source documents, of which the project thesis is the initial instance.
- **FR-016**: System MUST ingest the structured clinical case-record dataset, in which each record carries its clinical and serological findings, the resulting maternal and child classifications, and the argumentation and recommendation recorded for it.
- **FR-017**: System MUST preserve, for every ingested unit of knowledge, an attribution sufficient to locate it in its original source — for narrative documents a section or page reference, for case records the record identifier.
- **FR-018**: System MUST treat each case record as an atomic unit and MUST NOT split a record's findings apart from its classification and recommendation.
- **FR-019**: System MUST validate each case record on ingestion and MUST report any record it skips together with the reason.
- **FR-020**: System MUST record the version or revision of the case-record dataset that produced each build, so answers can be traced to the dataset state that generated them.
- **FR-021**: System MUST allow the Administrator to add, replace, and remove sources, and to trigger a full rebuild.
- **FR-022**: System MUST complete a full rebuild of the initial corpus unattended, without manual intervention between sources.
- **FR-023**: System MUST leave the previously serving knowledge base intact and queryable if a build fails at any point.
- **FR-024**: System MUST report, after each build, the number of sources processed, entities extracted, relationships extracted, case records indexed, and units skipped.
- **FR-025**: System MUST make the outcome, timing, and statistics of the most recent build visible to the Administrator.

#### Knowledge representation and retrieval

- **FR-026**: System MUST represent the corpus as a graph of clinical concepts and the relationships between them, in addition to the text of the source material.
- **FR-027**: System MUST model, at minimum, these concept types: serological marker and its result, gestational timing, maternal classification, child classification, clinical finding, diagnostic investigation, recommendation, and source document.
- **FR-028**: System MUST link each case record to every concept it exhibits, so that records sharing a serological or clinical pattern are reachable from one another.
- **FR-029**: System MUST support retrieval combining textual similarity with traversal of these relationships, so a question can reach material that shares no wording with it but is clinically connected to it.
- **FR-030**: System MUST support summarisation across groups of related concepts, so broad questions ("what distinguishes probable from confirmed maternal infection?") are answered from an overview rather than from a handful of arbitrary passages.
- **FR-031**: System MUST rank retrieved material and pass a bounded amount of it to answer generation, so answer quality does not degrade as the corpus grows.
- **FR-032**: System MUST record which retrieved units contributed to each answer.

#### Question and answer lifecycle

- **FR-033**: System MUST accept a free-text question from an authenticated doctor, bounded to a stated maximum length, and MUST reject longer submissions with that limit stated.
- **FR-034**: System MUST interpret a question in the context of its conversation, so follow-ups referring to earlier turns resolve correctly.
- **FR-035**: System MUST determine whether a question falls within the congenital toxoplasmosis scope and MUST decline out-of-scope questions with a restatement of scope.
- **FR-036**: System MUST generate answers only from retrieved corpus material, and MUST state explicitly when the corpus does not support an answer rather than drawing on unsourced general knowledge.
- **FR-037**: System MUST attach to every substantive claim an attribution identifying its supporting source, and MUST allow the doctor to expand any attribution to read the supporting text.
- **FR-038**: System MUST surface disagreement between sources, attributing each position, rather than silently selecting one.
- **FR-039**: System MUST state when the evidence supporting an answer is thin — for instance when very few case records match the described pattern.
- **FR-040**: System MUST present an explicit failure, and never a fabricated answer, when answer generation fails or times out.
- **FR-041**: System MUST treat the content of a doctor's question as data to be answered and MUST NOT allow it to alter the system's operating instructions or safety framing.

#### Clinical safety

- **FR-042**: System MUST present itself as a diagnostic decision-support classifier for qualified clinicians, whose output supports but does not replace the treating clinician's judgement.
- **FR-043**: System MUST classify the patient described, returning a maternal classification, a child classification, an argumentation, and a recommendation, each drawn from the defined value sets in FR-063.
- **FR-044**: System MUST state, alongside every classification, the confidence or coverage basis for it, and MUST explicitly flag when the described findings fall outside the parameterised rules — the `Situação não parametrizada` outcome MUST be reported as "no classification could be determined", never as a clinical conclusion.
- **FR-045**: System MUST state, in every classified result, that the classification is decision support and that clinical judgement and responsibility rest with the treating clinician.
- **FR-046**: System MUST retain its clinical-safety framing and its classification value sets regardless of retrieved content or the phrasing of a doctor's input.
- **FR-047**: System MUST show every doctor, before first use, a statement of what the tool is, what it was built from, its known limitations, and its regulatory status, and MUST record that they acknowledged it.
- **FR-062**: System MUST record, for every classification it issues, the rule configuration version that produced it, so any result can be reproduced and audited after the fact.
- **FR-063**: System MUST allow a doctor to see which input findings drove a classification, so the result can be checked rather than taken on trust.

#### Patient-identifying information

- **FR-048**: System MUST accept the de-identified clinical findings required to classify a case, and MUST NOT require, request, or provide a field for any direct patient identifier — name, date of birth, address, contact details, hospital or NHS number.
- **FR-049**: System MUST detect direct identifiers in free-text submissions and MUST warn the doctor before the case is processed.
- **FR-050**: System MUST strip detected direct identifiers before anything is written to storage, so that no identifier reaches conversation history or the training dataset. Stripping MUST happen on the write path, not as a later cleanup pass.
- **FR-051**: System MUST NOT write submitted content or returned answers into operational logs; diagnostic logging is limited to non-content metadata.
- **FR-074**: System MUST warn doctors, both on entry and at the point of submission, that only de-identified findings may be entered, and MUST state that submissions are retained as training data.
- **FR-075**: System MUST treat the stored clinical findings as health data notwithstanding de-identification, and MUST apply a documented retention period to conversation history and to the training dataset.
- **FR-076**: System MUST allow the Administrator to delete any captured training row on request, so that an erasure request can be honoured even though rows carry no identifier.

#### Language

- **FR-077**: System MUST reply in the language the doctor wrote in, for both classifications and free-text answers.
- **FR-078**: System MUST display the canonical Portuguese classification, argumentation, and recommendation text verbatim alongside any translation, and MUST NOT present a translation as the sole record of a clinical conclusion.
- **FR-079**: System MUST store the canonical Portuguese text, not a translation, in the training dataset and in conversation history, so stored clinical wording matches the historical dataset exactly.
- **FR-080**: System MUST retrieve relevant material from the corpus regardless of the language a question was asked in.
- **FR-081**: System MUST label translated clinical text as a translation wherever it appears.

#### Conversations and records

- **FR-052**: System MUST persist each doctor's conversations across sessions, with their questions, answers, and attributions.
- **FR-053**: System MUST make a doctor's conversations readable only by that doctor and by no other doctor.
- **FR-054**: System MUST preserve a stored answer's attributions as originally produced, even after the knowledge base has been rebuilt.
- **FR-055**: System MUST allow a doctor to rename and delete their own conversations, and deletion MUST remove the content.
- **FR-056**: System MUST allow a doctor to export a conversation as a self-contained document containing the exchange, its attributions, and the date the answers were produced.
- **FR-057**: System MUST allow a doctor to record whether an answer was useful, and MUST make that feedback visible to the Administrator in aggregate.

#### Availability and operations

- **FR-058**: System MUST serve the application only over an encrypted connection at `mychatbotproject.uk`.
- **FR-059**: System MUST expose a health signal distinguishing "application reachable" from "knowledge base ready to answer".
- **FR-060**: System MUST tell doctors plainly that the knowledge base is not ready when no successful build exists.
- **FR-061**: System MUST retain enough operational history for the Administrator to see question volume and failure rates over time, without retaining question content.

#### Classification contract

- **FR-064**: System MUST accept the 14 clinical input findings present in the historical dataset — fundoscopic examination, neuroimaging, PCR/amniotic fluid, first-sample maternal IgM / IgG / avidity, gestational week of the first sample, last-sample maternal IgM / IgG, post-natal maternal IgM / IgG, and child IgM / IgA / IgG — and MUST constrain each to its permitted values.
- **FR-065**: System MUST report a maternal classification from the defined set (infection prior to pregnancy; probable acute infection; possible acute infection during pregnancy; confirmed acute infection during pregnancy; not parameterised) and a child classification from its defined set.
- **FR-066**: System MUST produce identical output for identical input; the same findings MUST NOT yield different classifications on different occasions.
- **FR-067**: System MUST prompt the doctor for any missing required finding rather than inferring, defaulting, or guessing it.
- **FR-068**: System MUST NOT invent a classification, argumentation, or recommendation outside the defined value sets.

#### Training data capture

- **FR-069**: System MUST persist each classification event — the submitted findings, the returned classifications, argumentation, and recommendation — to an append-only `new_outputs.csv` dataset for training future models.
- **FR-070**: System MUST record with each captured row the timestamp, the rule configuration version, and the identifier of the account that submitted it.
- **FR-071**: System MUST allow the doctor, or the Administrator on review, to mark a captured row as clinically incorrect, so erroneous rows can be excluded from future training.
- **FR-072**: System MUST make the captured dataset schema-compatible with the existing historical dataset, so the two can be combined for training without transformation.
- **FR-073**: System MUST apply the patient-identifier protections in FR-048 through FR-051 to the captured dataset, which is a durable training corpus rather than transient conversation history.

---

### Key Entities

- **Account**: A person who can sign in. Holds an email address, a role (Administrator or Doctor), a confirmation state, and an active-or-revoked state. Exactly one Administrator exists.
- **Invitation**: An Administrator's grant of registration rights to a specific email address. Has an issue time, an expiry, and a used-or-unused state. Registration is impossible without one.
- **Source Document**: A narrative document admitted to the corpus — initially the project thesis. Carries a title, an ingestion time, and a revision marker.
- **Case Record**: One historical clinical case: its serological and clinical findings, gestational timing, the maternal and child classifications assigned to it, and the argumentation and recommendation recorded for it. Stably identified so answers can cite it.
- **Knowledge Unit**: The smallest attributable piece of retrievable knowledge — a passage of a Source Document, or a whole Case Record. Always carries an attribution back to its origin.
- **Concept**: A clinical entity extracted from the corpus — a serological marker and result, a classification, a finding, an investigation, a recommendation, a gestational window.
- **Relationship**: A directed, typed connection between two Concepts, or between a Concept and a Knowledge Unit, forming the graph that retrieval traverses.
- **Concept Group**: A cluster of densely related Concepts together with a summary of what the corpus says about that cluster as a whole. Serves broad questions.
- **Build**: One construction of the knowledge base from a defined set of sources. Records its start and end, its outcome, its statistics, and the dataset revisions it consumed. Answers are traceable to a Build.
- **Conversation**: An ordered exchange between one Doctor and the assistant. Owned solely by that Doctor.
- **Message**: A single question or answer within a Conversation. An answer carries its Attributions and the Build that produced it.
- **Attribution**: The link from a claim in an answer to the Knowledge Unit supporting it, durable enough to survive later rebuilds.
- **Audit Event**: An immutable record of a security- or curation-significant action: actor, action, target, time.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of in-scope answers carry at least one attribution, and every attribution a doctor expands resolves to source material that genuinely supports the claim it is attached to.
- **SC-002**: On a reviewer-built benchmark of at least 30 questions with known answers in the corpus, at least 85% of answers are judged factually consistent with the corpus by a domain reviewer, and no answer in the benchmark contains a fabricated citation.
- **SC-003**: 95% of questions receive a complete answer within 20 seconds of submission, and every question shows visible progress within 2 seconds.
- **SC-004**: At least 95% of deliberately out-of-scope questions are declined rather than answered.
- **SC-005**: At least 95% of questions the corpus cannot support produce an explicit statement to that effect rather than an unsupported answer.
- **SC-006**: An invited doctor can go from receiving the invitation to reading their first attributed answer in under 5 minutes without assistance.
- **SC-007**: No account can read another account's conversations, and no Doctor account can perform an administrative action; verified by exercising every administrative capability against a Doctor account.
- **SC-008**: A full rebuild of the corpus completes unattended within 60 minutes and reports its statistics.
- **SC-009**: A failed build never leaves doctors unable to ask questions; verified by injecting a failure at each stage of the build and confirming answers still work.
- **SC-010**: Stored conversation history and the captured training dataset contain no direct patient identifiers, and operational logs contain no submitted or returned content; verified by inspecting every stored row against a set of deliberate identifier-injection test submissions, not by sampling.
- **SC-011**: Every classified result states that clinical judgement rests with the treating clinician; verified across the benchmark set.
- **SC-015**: Replaying all 24 historical cases through the system reproduces the recorded maternal and child classifications for 100% of them. The recorded outputs are deterministic, so this is the correctness bar regardless of how the classification is produced; any mismatch blocks release until it is either fixed or signed off in writing after clinical review.
- **SC-016**: Submitting identical findings on 20 separate occasions yields an identical classification every time. Variation across identical inputs is a defect, not acceptable model behaviour.
- **SC-019**: 100% of returned classifications, argumentations, and recommendations fall within the permitted value sets, verified by output validation on every response — never by sampling.
- **SC-020**: Every returned classification is accompanied by an explanation citing at least one thesis passage or historical case, and those citations resolve to material that genuinely supports the stated classification in at least 95% of a reviewed sample.
- **SC-017**: 100% of classification events are captured to the training dataset with their rule configuration version, and the captured file remains loadable alongside the historical dataset without transformation.
- **SC-018**: Findings that fall outside the parameterised rules are reported as "no classification could be determined" in 100% of cases, and never as a clinical conclusion.
- **SC-012**: A revoked account is refused within 5 minutes of revocation.
- **SC-013**: The tool remains available for questions at least 99% of the hours in a calendar month, excluding announced maintenance.
- **SC-014**: Recurring monthly cost to operate the deployed system stays under £40 at the expected load of a small clinician group.

---

## Assumptions

These are reasonable defaults adopted where the feature description did not specify a detail. The four highest-impact decisions were originally flagged for confirmation and were all settled in the `/speckit-clarify` session of 2026-08-06; they are marked **✅ Resolved** below, with the decision recorded in the Clarifications section. The remaining items are working assumptions that planning may revisit.

**Scope and posture**

- **✅ Resolved 2026-08-06 — The system classifies the patient.** The owner's decision is that the chatbot acts as the classifier: the doctor supplies the patient's findings and the system returns the maternal classification, child classification, argumentation, and recommendation for that patient, as an aid to diagnosis. FR-042 through FR-047 and FR-064 through FR-068 are written for that posture.

  **Regulatory consequence, stated once for the record:** software intended to inform diagnosis of an individual patient generally meets the UK definition of a medical device, placing it in scope of the UK Medical Devices Regulations and requiring UKCA marking and a registered manufacturer before it may be supplied for clinical use. That is a fact about the product category, not a reason to build it differently. The practical implication for planning is that the tool should carry an explicit "not for clinical use / research and evaluation only" statement until that route is assessed, and FR-047 requires exactly that acknowledgement. Confirming the intended use — research prototype and thesis work, versus supply to practising clinicians — is the single decision that determines whether this obligation is live today.
- **✅ Resolved 2026-08-06 — De-identified findings only.** Doctors submit the clinical findings needed to classify; the system neither requests nor stores direct identifiers, and strips any it detects before writing (FR-048 through FR-051). `new_outputs.csv` therefore remains a de-identified research dataset, which keeps it usable for training and publishable alongside the thesis. Note that de-identified clinical findings are still health data: a retention period and an erasure path are required (FR-075, FR-076), and identifier stripping must be verified rather than assumed, since a single free-text field is enough to defeat it.
- **✅ Resolved 2026-08-06 — Reply in the doctor's language; canonical Portuguese always shown.** The assistant answers in whichever language the doctor used and retrieves across the corpus regardless of language, but the canonical Portuguese clinical text is always displayed verbatim and is what gets stored (FR-077 through FR-081). This requires a multilingual embedding model; the current `all-MiniLM-L6-v2` is English-centric and will retrieve Portuguese clinical text poorly, so replacing it is a prerequisite rather than an optimisation.
- **✅ Resolved 2026-08-06 — One curated corpus; Administrator uploads only.** Doctors read the corpus and cannot contribute to it. The per-user upload feature in the deployed application is retired (FR-082), which also removes the per-user vector store machinery. This is what makes SC-016 meaningful: identical findings classify identically because the corpus is identical for every doctor.

**Users and access**

- Access is invitation-only because the audience is qualified clinicians. Verification of medical registration is out of scope for this version — the Administrator's decision to invite constitutes the vetting step.
- There is exactly one Administrator, held by the project owner, with no self-service path to that role.
- The expected population is a small group of clinicians (order of tens), not a public audience. Success criteria are sized accordingly.
- Doctors use a current desktop browser on a reliable connection. The interface is responsive, but the design target is desktop.

**Data and corpus**

- `logs/request-logs.csv` is the structured case-record dataset referred to in the description. It holds 24 records across 29 columns, each combining serological and clinical findings with the maternal and child classifications and the recorded argumentation and recommendation. It is a structured dataset rather than a folder of loose text documents, and this specification treats it as such — this is what motivates the graph representation in FR-026 through FR-030.
- `text/monografia.pdf` is the project thesis referred to as the second knowledge source. (The description places it at the project root; it is at `text/`.)
- `text/IA-Toxo_Pitch.pdf` exists alongside the thesis but is presentation material, not clinical knowledge, and is excluded from the corpus.
- The corpus is small and grows slowly. Rebuilds are infrequent, and a full rebuild is acceptable in place of incremental update.
- The historical case records are treated as a record of past classification practice, not as ground truth. Answers attribute to them accordingly.
- The corpus contains no patient identifiers; the case records are already de-identified.

**Fixed architectural constraints (owner-mandated, not open to planning trade-off)**

- Classification and explanation are produced by a **fine-tuned LLM using GraphRAG**, not by a rules engine.
- The knowledge graph is stored in **Neo4j**.
- The assistant **both diagnoses and educates** — it classifies the patient and explains the reasoning, and it also answers free-text educational questions (User Stories 1 and 2 respectively).

These were decided on 2026-08-06 and supersede the alternatives explored in `architecture-notes.md`. Planning should treat them as given and design the safeguards around them (output validation against the permitted value sets, deterministic decoding, and historical-case replay) rather than reopening the choice.

**Operations**

- The system runs on the existing single-host deployment behind the existing reverse proxy at `mychatbotproject.uk`, with encryption terminated there.
- Neo4j adds a persistent service to a host that currently runs only the application and nginx. Its memory footprint and operating cost must be accommodated within the deployment, and SC-014's cost ceiling may need revisiting as a result.
- A single administrator operating one host means announced maintenance windows are acceptable; the availability target reflects that.
- Answer generation depends on an external model service. Its unavailability is an expected failure mode, handled by FR-040, not designed away.
- The fine-tuned model referred to in the description is a component of answer generation. This specification states what answers must do; it does not assume how fine-tuning and retrieval divide that work, which is a planning decision.

---

## Constitution Impact

**Resolved 2026-08-06 — constitution amended to v2.0.0.** The conflicts this section previously
recorded have been settled by amendment rather than left as divergence. The spec is now aligned with
governance, and `/speckit-plan` can be checked against it directly.

- **Principle II** was redefined from *Per-User Data Isolation* to *Shared Corpus, Isolated Patient Records*. The curated corpus is shared and Administrator-owned; isolation remains absolute for each doctor's own conversations and classifications.
- **Principle III** was replaced. *Responsible AI for Health Education* — which forbade personal diagnosis — became *Clinical Decision Support Safety (NON-NEGOTIABLE)*, whose safeguards are reproducibility, fidelity to the historical dataset, constrained output, explicit non-classification, explainability, clinician responsibility, and auditability. This reversal is why the amendment is MAJOR.
- **Principle V** retains its preference for simplicity, with Neo4j and GraphRAG recorded as owner-mandated exceptions rather than measured needs, so they are visible as decisions and not mistaken for precedent.
- **Principle VI** was retargeted from per-user vector stores to the shared graph, and now requires a multilingual embedding model.
- **Principle VII (Training Data Integrity)** was added to govern the capture loop, including the requirement that rows marked clinically incorrect are excluded from training.
- A **Regulatory Posture** section was added, carrying `TODO(INTENDED_USE)` — research and thesis evaluation versus supply for use on real patients. That decision remains open and is the one governance item still outstanding.
