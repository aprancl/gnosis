# Koine Greek Audio Data Collection PRD

**Version**: 1.0
**Author**: aprancl
**Date**: 2026-02-01
**Status**: Draft
**Spec Type**: New feature
**Spec Depth**: Detailed specifications
**Description**: Research, collect, and organize public domain and self-recorded Koine Greek audio data suitable for training a custom TTS model using Buth/KEP pronunciation.

---

## 1. Executive Summary

This spec defines the process for collecting and organizing Koine Greek audio training data to enable a custom TTS model (Piper/VITS). The primary data sources are the Karvounakis public domain Modern Greek NT recordings (~20 hours) for pre-training, and self-recorded KEP (Koine Era Pronunciation) audio (1-4 hours) for fine-tuning. The effort follows a phased approach with an early proof-of-concept gate to validate the time investment before committing to full recording.

## 2. Problem Statement

### 2.1 The Problem
No Koine Greek TTS dataset or speech corpus exists anywhere — not in academic repositories, not on Hugging Face, not in Common Voice, not in any commercial offering. The custom Koine Greek TTS model (Task #10 in SPEC-koine-greek-tts) is completely blocked until training data is collected.

### 2.2 Current State
- Gnosis uses Google Cloud TTS with Modern Greek voice as an interim solution
- The pronunciation dictionary (376 entries, 1445 word forms) provides SSML phoneme overrides for known vocabulary
- Novel words and inflections not in the dictionary are pronounced with Modern Greek phonology, which differs from Buth/KEP Koine pronunciation
- No public Koine Greek speech datasets exist in any repository

### 2.3 Impact Analysis
Without training data, the custom TTS model cannot be built. The project remains dependent on Google Cloud TTS ($4/1M characters), which:
- Uses Modern Greek pronunciation (not historically accurate Koine)
- Requires ongoing API costs
- Cannot be customized for specific pronunciation rules
- Limits Gnosis to the pronunciation dictionary for accuracy

### 2.4 Business Value
A custom Koine Greek TTS model is the long-term cornerstone of Gnosis voice features. Collecting this data:
- Unblocks the entire Phase 3 custom model pipeline (Tasks #10, #11, #12)
- Eliminates recurring Google Cloud TTS costs once the custom model is deployed
- Enables historically accurate Buth/KEP pronunciation for all Greek text
- Creates a unique, potentially open-source asset (first-ever Koine Greek speech dataset)

## 3. Goals & Success Metrics

### 3.1 Primary Goals
1. Acquire and organize ~20 hours of public domain Modern Greek NT audio (Karvounakis) with aligned Textus Receptus transcripts
2. Self-record 1-4 hours of KEP-pronounced Koine Greek audio with aligned SBLGNT transcripts
3. Produce a training-ready dataset in LJSpeech format for Piper/VITS
4. Validate the approach with a proof-of-concept model before committing to full recording

### 3.2 Success Metrics

| Metric | Current Baseline | Target | Measurement Method | Timeline |
|--------|------------------|--------|-------------------|----------|
| Public domain audio collected | 0 hrs | ~20 hrs | Karvounakis download + alignment | Phase 1 |
| Self-recorded KEP audio | 0 hrs | 0.5 hrs (PoC), 1-4 hrs (full) | Recording session logs | Phase 2-3 |
| Audio-text alignment accuracy | N/A | >95% segment accuracy | Manual spot-check of 50 random segments | Phase 1-2 |
| LJSpeech format compliance | N/A | 100% | Automated validation script | All phases |
| PoC model intelligibility | N/A | Recognizable Greek words | Manual listening evaluation | Phase 2 gate |

### 3.3 Non-Goals
- Training the TTS model (covered by Task #10 / separate spec)
- Deploying the model to production (covered by Task #11)
- Creating a comprehensive phonetic coverage analysis (optional future work)
- Recording the entire NT (1-4 hours of selected passages is sufficient)

## 4. User Research

### 4.1 Target Users

#### Primary Persona: TTS Model Trainer (Developer)
- **Role/Description**: The developer building the Piper/VITS training pipeline
- **Goals**: Receive clean, aligned, properly formatted audio data for model training
- **Pain Points**: No existing Koine Greek dataset; must validate quality before investing training compute
- **Context**: Uses the dataset as input to `scripts/train-tts-model.ts` or Piper training CLI

#### Secondary Persona: Gnosis Learner (End User)
- **Role/Description**: Koine Greek student using Gnosis for conversational practice
- **Goals**: Hear accurate Koine Greek pronunciation during lessons
- **Pain Points**: Current Google Cloud TTS uses Modern Greek pronunciation
- **Context**: Hears TTS output during voice mode conversations and vocabulary review

### 4.2 User Journey Map

```
[No data] --> [Download Karvounakis PD audio] --> [Align with TR text] --> [Validate pipeline]
     |
     +--> [Self-record ~30 min KEP] --> [Train PoC model] --> [Evaluate quality]
                                                                     |
                                                         [Quality OK?] --> [Record 1-4 hrs more]
                                                         [Quality bad?] --> [Reassess approach]
```

## 5. Functional Requirements

### 5.1 Feature: Public Domain Audio Acquisition (Karvounakis)

**Priority**: P0 (Critical)

#### User Stories

**US-001**: As a model trainer, I want the Karvounakis NT audio downloaded and organized so that I can use it as pre-training data.

**Acceptance Criteria**:
- [ ] All Karvounakis NT audio files downloaded from Internet Archive
- [ ] Audio converted to mono WAV at 22.05 kHz, 16-bit (Piper standard)
- [ ] Files organized by NT book (e.g., `karvounakis/matthew/`, `karvounakis/john/`)
- [ ] Total duration verified (~20 hours expected)
- [ ] Public Domain Mark 1.0 license documented

**Edge Cases**:
- Missing or corrupted files on Internet Archive: Document gaps, skip affected content
- Variable audio quality across recordings: Flag low-quality segments for exclusion

---

### 5.2 Feature: Textus Receptus Transcript Alignment

**Priority**: P0 (Critical)

#### User Stories

**US-002**: As a model trainer, I want each Karvounakis audio segment aligned with its Textus Receptus Greek text so that the model can learn pronunciation-to-text mappings.

**Acceptance Criteria**:
- [ ] Scrivener's Textus Receptus 1894 text sourced (public domain)
- [ ] Text segmented at verse or sentence boundaries matching audio segments
- [ ] Audio files split into segments of 5-15 seconds each
- [ ] Each segment has a corresponding transcript in metadata.csv
- [ ] Alignment accuracy >95% verified by manual spot-check of 50 random segments
- [ ] metadata.csv follows LJSpeech format: `filename|transcription`

**Edge Cases**:
- Karvounakis may skip or combine verses: Mark discrepancies in metadata
- Punctuation differences between audio reading and text: Normalize punctuation in transcripts

---

### 5.3 Feature: Self-Recorded KEP Audio

**Priority**: P0 (Critical)

#### User Stories

**US-003**: As a model trainer, I want KEP-pronounced Koine Greek audio recordings of curriculum-relevant content so that the model learns historically accurate pronunciation.

**Acceptance Criteria**:
- [ ] Recording setup validated (SNR > 30dB, no clipping, consistent levels)
- [ ] SBLGNT text (CC-BY 4.0) used as transcript source
- [ ] Content prioritized: Gnosis curriculum chapters 1-7 vocabulary and passages first
- [ ] Audio recorded as mono WAV at 22.05 kHz, 16-bit
- [ ] Segments 5-15 seconds each, sentence-level boundaries
- [ ] Phase 2 PoC: minimum 30 minutes of validated recordings
- [ ] Phase 3 full: 1-4 hours of validated recordings
- [ ] metadata.csv in LJSpeech format with SBLGNT transcripts

**Edge Cases**:
- Pronunciation uncertainty on rare words: Note in metadata, record best KEP approximation
- Background noise in recording session: Re-record affected segments
- Vocal fatigue during long sessions: Limit to 30-minute recording blocks with breaks

---

### 5.4 Feature: Automated Quality Validation

**Priority**: P1 (High)

#### User Stories

**US-004**: As a model trainer, I want automated quality checks on all audio so that I can identify and fix problems before training.

**Acceptance Criteria**:
- [ ] Validation script checks: sample rate, bit depth, channel count, duration
- [ ] SNR (signal-to-noise ratio) computed per segment, flag if < 20dB
- [ ] Clipping detection: flag segments with samples at max amplitude
- [ ] Silence detection: flag segments with > 2 seconds of leading/trailing silence
- [ ] Duration validation: flag segments shorter than 1s or longer than 20s
- [ ] Metadata completeness: every WAV file has a transcript entry, and vice versa
- [ ] Report generated: summary of pass/fail counts, flagged segments list

**Edge Cases**:
- False positive clipping on loud consonants (plosives): Allow configurable threshold
- Very short utterances (single words): Accept down to 0.5s for vocabulary recordings

---

### 5.5 Feature: Dataset Organization and Documentation

**Priority**: P1 (High)

#### User Stories

**US-005**: As a model trainer, I want the complete dataset organized in a standard directory structure with full documentation so that I can feed it directly to the training pipeline.

**Acceptance Criteria**:
- [ ] Directory structure follows LJSpeech convention:
  ```
  data/tts-training/
  ├── karvounakis/          # Public domain Modern Greek (~20 hrs)
  │   ├── wavs/
  │   └── metadata.csv
  ├── kep-self/             # Self-recorded KEP (1-4 hrs)
  │   ├── wavs/
  │   └── metadata.csv
  ├── README.md             # Sources, licensing, methodology
  └── LICENSE               # License summary for the dataset
  ```
- [ ] README.md documents: all sources with URLs, licensing terms per source, recording methodology, pronunciation system used, known limitations
- [ ] LICENSE file summarizes: Public Domain Mark 1.0 for Karvounakis, CC-BY 4.0 for SBLGNT text, self-recorded audio license (to be decided)
- [ ] Total dataset statistics logged: hours, segments, unique words, phoneme coverage

**Edge Cases**:
- Dataset grows beyond expected size: Add disk usage monitoring to validation script

## 6. Non-Functional Requirements

### 6.1 Audio Quality Standards
- Sample rate: 22.05 kHz (Piper medium quality standard)
- Bit depth: 16-bit signed PCM
- Channels: Mono
- Format: WAV (uncompressed)
- Peak level: between -24 dB and -6 dB
- SNR: > 30 dB for self-recordings, > 20 dB for Karvounakis (accept lower due to source quality)
- No background music, no reverb, minimal room echo

### 6.2 Licensing Requirements
- All data must be public domain, CC-BY, or CC-BY-SA
- No data from sources that prohibit derivative works or commercial use
- Each source must have license verification documented with:
  - License type and version
  - URL to license statement
  - Date verified
  - Any attribution requirements
- **Explicitly excluded sources**: Faith Comes by Hearing, API.Bible, KoineGreek.com (Kantor), Biblical Language Center (Buth) — all have restrictive licenses

### 6.3 Data Integrity
- All audio files pass automated validation before inclusion
- metadata.csv entries are UTF-8 encoded with NFC-normalized Greek text
- No duplicate segments (deduplicate by transcript text)
- Consistent filename convention: `{source}_{book}_{verse}_{segment}.wav`

## 7. Technical Considerations

### 7.1 Architecture Overview
This is primarily a data pipeline, not a software feature. The pipeline consists of:
1. **Download scripts** — Fetch audio from Internet Archive
2. **Processing scripts** — Convert format, split segments, align text
3. **Recording workflow** — Piper Recording Studio for guided self-recording
4. **Validation scripts** — Automated quality checks
5. **Organization scripts** — Assemble final dataset structure

### 7.2 Tech Stack
- **Audio processing**: FFmpeg (format conversion, splitting, normalization)
- **Scripting**: TypeScript with tsx (consistent with project)
- **Recording**: Piper Recording Studio (web-based guided recording tool)
- **Text source**: SBLGNT (CC-BY 4.0), Scrivener's TR 1894 (public domain)
- **Audio analysis**: Node.js with wav-decoder or similar for SNR/level analysis
- **Storage**: Local filesystem during collection, S3 cache for final dataset

### 7.3 Integration Points
| System | Integration Type | Purpose |
|--------|-----------------|---------|
| Internet Archive | HTTP download | Source for Karvounakis public domain audio |
| SBLGNT text | File import | Transcript source for self-recordings |
| Textus Receptus text | File import | Transcript source for Karvounakis alignment |
| Piper Recording Studio | Local web app | Guided recording workflow |
| Piper training pipeline | File output | Dataset consumed by Task #10 |
| `src/lib/tts/data/pronunciation-dict.json` | Reference | IPA pronunciations guide KEP recording |

### 7.4 Technical Constraints
- FFmpeg must be available on the system for audio processing
- Recording requires a quiet environment with consistent acoustics
- Internet Archive download speeds may vary; support resume for interrupted downloads
- Piper Recording Studio requires a modern browser with WebAudio API support

## 8. Scope Definition

### 8.1 In Scope
- Downloading and organizing Karvounakis public domain NT audio
- Aligning Karvounakis audio with Textus Receptus transcripts
- Self-recording 1-4 hours of KEP-pronounced Greek (curriculum chapters first)
- Aligning self-recordings with SBLGNT transcripts
- Automated quality validation pipeline
- LJSpeech format dataset output
- License verification and documentation
- Proof-of-concept validation gate (Phase 2)

### 8.2 Out of Scope
- Training the TTS model (Task #10 / separate spec)
- Deploying the model (Task #11)
- A/B pronunciation validation with speakers (Task #12)
- Recording the complete NT (~20+ hours of self-recordings)
- Building a custom espeak-ng phonemizer for Koine Greek (needed for training, but separate task)
- Contacting Jesse Orloff for license negotiation (optional future enhancement)

### 8.3 Future Considerations
- Expand self-recordings beyond curriculum chapters to broader NT coverage
- Contact Jesse Orloff to negotiate CC-BY license for his KEP recordings (could add several hours)
- Create phonetic coverage analysis to identify under-represented phonemes
- Record additional speakers for multi-voice model training
- Open-source the dataset as the first publicly available Koine Greek speech corpus

## 9. Implementation Plan

### 9.1 Phase 1: Public Domain Data Acquisition
**Completion Criteria**: Karvounakis audio downloaded, converted, segmented, and aligned with TR text in LJSpeech format.

| Deliverable | Description | Dependencies |
|-------------|-------------|--------------|
| Download script | Fetch all Karvounakis NT audio from Internet Archive | Internet Archive access |
| Format conversion | Convert to mono 22.05kHz 16-bit WAV | FFmpeg installed |
| TR text corpus | Obtain Scrivener's TR 1894 in machine-readable Greek | Public domain text source |
| Audio segmentation | Split audio at verse/sentence boundaries into 5-15s segments | FFmpeg |
| Text alignment | Match each audio segment to its TR transcript | TR text + segmented audio |
| Validation run | Run automated quality checks on all segments | Validation script |
| metadata.csv | Generate LJSpeech format metadata for Karvounakis dataset | Aligned segments |

**Checkpoint Gate**: Manual review of 50 random aligned segments. Verify audio quality is acceptable for pre-training and that text alignment is accurate. Decide whether to proceed with self-recording.

---

### 9.2 Phase 2: Proof of Concept Recording
**Completion Criteria**: ~30 minutes of self-recorded KEP audio, validated, and used to train a PoC Piper model to evaluate quality.

| Deliverable | Description | Dependencies |
|-------------|-------------|--------------|
| Recording setup validation | Test mic, levels, room acoustics, validate SNR > 30dB | Recording equipment |
| SBLGNT text preparation | Extract Ch 1-3 curriculum passages, segment into recording prompts | SBLGNT text (CC-BY 4.0) |
| Recording sessions | Record ~30 min of KEP-pronounced passages using Piper Recording Studio | Quiet room, pronunciation guide |
| Quality validation | Run automated checks on self-recorded segments | Validation script |
| PoC dataset assembly | Combine Karvounakis + 30 min KEP in LJSpeech format | Phase 1 complete |
| PoC model training | Train a Piper model on combined dataset (hand off to Task #10) | Training pipeline |

**Checkpoint Gate**: Evaluate PoC model output. Can it produce recognizable Greek words? Is the KEP pronunciation transfer working? If quality is promising, proceed to Phase 3. If not, reassess approach (more data? different base model? different fine-tuning strategy?).

---

### 9.3 Phase 3: Full KEP Recording
**Completion Criteria**: 1-4 hours of self-recorded KEP audio, validated, organized, and ready for full model training.

| Deliverable | Description | Dependencies |
|-------------|-------------|--------------|
| Extended text preparation | Extract Ch 4-7 curriculum + additional NT passages for phonetic coverage | SBLGNT text |
| Recording sessions | Record 1-4 hours of KEP audio across multiple sessions | Phase 2 gate passed |
| Quality validation | Run automated checks, flag and re-record problematic segments | Validation script |
| Final dataset assembly | Complete LJSpeech dataset: Karvounakis (~20 hrs) + KEP (1-4 hrs) | All recordings done |
| Documentation | Complete README with sources, licensing, methodology, statistics | All data collected |
| Handoff to training | Dataset ready for consumption by Task #10 training pipeline | Phase 3 complete |

## 10. Dependencies

### 10.1 Technical Dependencies
| Dependency | Owner | Status | Risk if Delayed |
|------------|-------|--------|-----------------|
| FFmpeg installation | Developer | Available | Blocks all audio processing |
| Internet Archive availability | External | Available | Blocks Karvounakis download |
| SBLGNT text in machine-readable format | External | Available (GitHub) | Blocks self-recording transcripts |
| Textus Receptus text | External | Available (public domain) | Blocks Karvounakis alignment |
| Piper Recording Studio | External | Available (open source) | Use alternative recording method |
| Recording equipment | Developer | Available | Blocks self-recording |
| Pronunciation dictionary (`pronunciation-dict.json`) | Gnosis project | Complete (Task #4) | Used as KEP reference |

### 10.2 Downstream Dependencies
| Task | Dependency on This Spec | Impact |
|------|------------------------|--------|
| Task #10: TTS model training pipeline | Requires completed LJSpeech dataset | Cannot begin training without data |
| Task #11: Deploy custom model | Blocked by #10 | Transitive dependency |
| Task #12: A/B pronunciation validation | Blocked by #11 | Transitive dependency |

## 11. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation Strategy | Owner |
|------|--------|------------|--------------------|----- |
| Time investment doesn't produce usable model | High | Medium | Phased approach with PoC gate at 30 min; evaluate before committing to hours of recording | Developer |
| KEP pronunciation inconsistency across sessions | Medium | Medium | Use pronunciation dictionary as reference; record in consistent blocks; review recordings before including | Developer |
| Karvounakis Modern Greek → KEP fine-tuning doesn't transfer well | Medium | Medium | Modern Greek is phonetically closer to KEP than Erasmian; if transfer fails, train KEP-only with more self-recorded data | Developer |
| Audio quality insufficient for TTS training | Medium | Low | Validate with automated checks before recording sessions; test setup with sample recordings first | Developer |
| Internet Archive Karvounakis files removed or corrupted | Low | Low | Download and archive locally as early as possible; verify checksums | Developer |
| SBLGNT vs TR textual differences cause alignment issues | Low | Medium | Use TR text for Karvounakis alignment, SBLGNT for self-recordings; keep datasets separate in training | Developer |
| espeak-ng phonemizer lacks Koine Greek support | High | High | Will need custom phoneme mapping; separate task, but may require dataset format adjustments | Developer |

## 12. Open Questions

| # | Question | Owner | Due Date | Resolution |
|---|----------|-------|----------|------------|
| 1 | What license should self-recorded audio be released under? (CC-BY 4.0? Public domain?) | Developer | Before Phase 3 | |
| 2 | Is Piper Recording Studio the best tool, or should we use a simpler recording + splitting workflow? | Developer | Phase 2 | |
| 3 | How to handle espeak-ng phonemizer for Koine Greek in Piper training? | Developer | Before Task #10 | |
| 4 | Should we attempt forced alignment (e.g., Montreal Forced Aligner) for the Karvounakis data, or manual verse-level alignment? | Developer | Phase 1 | |
| 5 | Optimal ratio of Karvounakis pre-training data to KEP fine-tuning data for best results? | Developer | Phase 2 gate | |

## 13. Appendix

### 13.1 Glossary
| Term | Definition |
|------|------------|
| KEP | Koine Era Pronunciation — reconstructed pronunciation of 1st-century Koine Greek, based on Randall Buth's research |
| Buth pronunciation | Randall Buth's reconstructed "Living Koine" pronunciation system, the basis for KEP |
| Erasmian | Traditional academic pronunciation of Ancient Greek, widely taught but historically inaccurate |
| SBLGNT | Society of Biblical Literature Greek New Testament — modern critical text edition, CC-BY 4.0 |
| Textus Receptus (TR) | Traditional received text of the Greek NT, public domain (Scrivener 1894 edition) |
| LJSpeech format | Standard TTS dataset format: metadata.csv with `filename\|transcription` + WAV directory |
| Piper | Open-source TTS system by Rhasspy, supports VITS architecture |
| VITS | Variational Inference with adversarial learning for end-to-end Text-to-Speech |
| SNR | Signal-to-Noise Ratio — measure of audio quality (higher = cleaner audio) |
| Phonemizer | Tool that converts text (graphemes) to phonemes for TTS training |

### 13.2 Verified Audio Sources

| Source | URL | License | Pronunciation | Est. Duration |
|--------|-----|---------|---------------|---------------|
| Theo Karvounakis NT Audio | [Internet Archive](https://archive.org/details/acts-19-28) / [GitHub](https://github.com/ManolisMariakakis/Narration-of-the-Greek-New-Testament-TR-Scrivener-1894) | Public Domain Mark 1.0 | Modern Greek | ~20 hrs |
| Vasile Stancu Ancient Greek | [Internet Archive](https://archive.org/details/ancient_greek_audio) | Public Domain Mark 1.0 | Unknown | ~40 min |
| SBLGNT Text | [sblgnt.com](https://sblgnt.com/license/) | CC-BY 4.0 | N/A (text only) | N/A |

### 13.3 Excluded Sources (License Restrictions)

| Source | Reason for Exclusion |
|--------|---------------------|
| Faith Comes by Hearing / Bible.is | Non-commercial, explicitly prohibits AI/TTS use |
| API.Bible | Explicitly prohibits audio-to-text and text-to-audio AI |
| KoineGreek.com (Benjamin Kantor) | All rights reserved, personal non-commercial use only |
| Biblical Language Center (Randall Buth) | Commercial product, all rights reserved |
| Jordash Kiffiak / omilein.org | Part of paid course, no reuse rights |

### 13.4 Recording Equipment Recommendations

| Item | Recommendation | Budget |
|------|---------------|--------|
| Microphone (USB) | Audio-Technica AT2020USB+ | ~$100-150 |
| Microphone (XLR) | Rode NT1-A | ~$200-250 |
| Audio interface (if XLR) | Focusrite Scarlett Solo/2i2 | ~$100-170 |
| Pop filter + boom arm | Any decent combo | ~$30-60 |
| Headphones | Closed-back monitoring | ~$50-100 |

### 13.5 Research Sources
- [Jesse Orloff - NT Greek Readings Using KEP](https://jesseorloff.com/2024/10/19/all-nt-greek-readings-using-kep/)
- [Piper TTS Training Documentation](https://github.com/rhasspy/piper/blob/master/TRAINING.md)
- [Training a Tiny Piper TTS Model (Neurlang Blog)](https://blog.hashtron.cloud/post/2025-09-28-training-a-a-tiny-piper-tts-model-for-any-language/)
- [Cal Bryant - Training Piper with Minimal Data](https://calbryant.uk/blog/training-a-new-ai-voice-for-piper-tts-with-only-4-words/)
- [NVIDIA Riva - Recording TTS Dataset at Home](https://docs.nvidia.com/deeplearning/riva/user-guide/docs/tutorials/tts-dataset-recording-at-home.html)
- [Christ the Truth - Free Greek Audio Bible](https://www.christthetruth.net/2012/06/23/free-greek-audio-bible/)
- [Mr. Greek Geek - Greek Audio Recordings](https://www.mrgreekgeek.com/2020/09/02/greek-audio-recordings-of-the-old-new-testaments/)

---

*Document generated by SDD Tools*
