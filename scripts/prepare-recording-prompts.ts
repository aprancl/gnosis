#!/usr/bin/env npx tsx
/**
 * Prepare SBLGNT Greek text as recording prompts for KEP self-recording sessions.
 *
 * Extracts vocabulary from curriculum chapters 1-3 and sample SBLGNT passages,
 * segments text into recording prompts suitable for Piper Recording Studio,
 * and outputs prompt files with IPA references.
 *
 * SBLGNT text is used under CC-BY 4.0 license:
 *   Holmes, Michael W. The Greek New Testament: SBL Edition.
 *   Copyright 2010 Logos Bible Software and the Society of Biblical Literature.
 *   https://sblgnt.com - Licensed under CC BY 4.0.
 *
 * Usage:
 *   npx tsx scripts/prepare-recording-prompts.ts
 *   npx tsx scripts/prepare-recording-prompts.ts --dry-run
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { seedChapters } from "../src/lib/data/seed-scenarios";
import {
  loadDictionary,
  lookupWord,
  normalizeForLookup,
} from "../src/lib/tts/pronunciation-dict";
import type { PronunciationDictionary } from "../src/lib/tts/pronunciation-dict";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OUTPUT_DIR = join(__dirname, "..", "data", "tts-training", "kep-self");
const CHAPTERS_TO_INCLUDE = [1, 2, 3];

/** Target speaking rate: ~2.5 words/second for careful pronunciation */
const WORDS_PER_SECOND = 2.5;
/**
 * Recording overhead multiplier: accounts for pauses between prompts,
 * re-takes, setup time per prompt (~5-10 seconds overhead per prompt).
 * A multiplier of 3x converts pure speaking time to realistic session time.
 */
const RECORDING_OVERHEAD_MULTIPLIER = 3;
/** Min words per sentence prompt */
const MIN_PROMPT_WORDS = 5;
/** Max words per sentence prompt */
const MAX_PROMPT_WORDS = 25;

// ---------------------------------------------------------------------------
// SBLGNT Passages (CC-BY 4.0)
// ---------------------------------------------------------------------------
// Selected passages from the SBLGNT that align with Ch 1-3 curriculum.
// These are well-known NT passages containing vocabulary covered in the
// first three chapters.
//
// License: CC-BY 4.0
// Attribution: Holmes, Michael W. The Greek New Testament: SBL Edition.
//   Logos Bible Software / Society of Biblical Literature, 2010.
// ---------------------------------------------------------------------------

export const SBLGNT_PASSAGES: { ref: string; text: string }[] = [
  // John 1:1-5 — foundational passage, basic vocabulary
  { ref: "John 1:1a", text: "Ἐν ἀρχῇ ἦν ὁ λόγος" },
  { ref: "John 1:1b", text: "καὶ ὁ λόγος ἦν πρὸς τὸν θεόν" },
  { ref: "John 1:1c", text: "καὶ θεὸς ἦν ὁ λόγος" },
  { ref: "John 1:2", text: "οὗτος ἦν ἐν ἀρχῇ πρὸς τὸν θεόν" },
  {
    ref: "John 1:3a",
    text: "πάντα δι' αὐτοῦ ἐγένετο",
  },
  {
    ref: "John 1:3b",
    text: "καὶ χωρὶς αὐτοῦ ἐγένετο οὐδὲ ἕν ὃ γέγονεν",
  },
  {
    ref: "John 1:4",
    text: "ἐν αὐτῷ ζωὴ ἦν καὶ ἡ ζωὴ ἦν τὸ φῶς τῶν ἀνθρώπων",
  },
  {
    ref: "John 1:5",
    text: "καὶ τὸ φῶς ἐν τῇ σκοτίᾳ φαίνει καὶ ἡ σκοτία αὐτὸ οὐ κατέλαβεν",
  },
  // John 1:6-9
  {
    ref: "John 1:6",
    text: "ἐγένετο ἄνθρωπος ἀπεσταλμένος παρὰ θεοῦ ὄνομα αὐτῷ Ἰωάννης",
  },
  {
    ref: "John 1:7",
    text: "οὗτος ἦλθεν εἰς μαρτυρίαν ἵνα μαρτυρήσῃ περὶ τοῦ φωτός",
  },
  {
    ref: "John 1:8",
    text: "οὐκ ἦν ἐκεῖνος τὸ φῶς ἀλλ' ἵνα μαρτυρήσῃ περὶ τοῦ φωτός",
  },
  {
    ref: "John 1:9",
    text: "ἦν τὸ φῶς τὸ ἀληθινόν ὃ φωτίζει πάντα ἄνθρωπον ἐρχόμενον εἰς τὸν κόσμον",
  },
  // John 1:10-14
  {
    ref: "John 1:10a",
    text: "ἐν τῷ κόσμῳ ἦν καὶ ὁ κόσμος δι' αὐτοῦ ἐγένετο",
  },
  {
    ref: "John 1:10b",
    text: "καὶ ὁ κόσμος αὐτὸν οὐκ ἔγνω",
  },
  {
    ref: "John 1:11",
    text: "εἰς τὰ ἴδια ἦλθεν καὶ οἱ ἴδιοι αὐτὸν οὐ παρέλαβον",
  },
  {
    ref: "John 1:12",
    text: "ὅσοι δὲ ἔλαβον αὐτόν ἔδωκεν αὐτοῖς ἐξουσίαν τέκνα θεοῦ γενέσθαι τοῖς πιστεύουσιν εἰς τὸ ὄνομα αὐτοῦ",
  },
  {
    ref: "John 1:14a",
    text: "καὶ ὁ λόγος σὰρξ ἐγένετο καὶ ἐσκήνωσεν ἐν ἡμῖν",
  },
  {
    ref: "John 1:14b",
    text: "καὶ ἐθεασάμεθα τὴν δόξαν αὐτοῦ δόξαν ὡς μονογενοῦς παρὰ πατρός",
  },
  {
    ref: "John 1:14c",
    text: "πλήρης χάριτος καὶ ἀληθείας",
  },
  // Matthew 6:9-13 — Lord's Prayer (basic vocab, imperative forms)
  {
    ref: "Matt 6:9",
    text: "Πάτερ ἡμῶν ὁ ἐν τοῖς οὐρανοῖς ἁγιασθήτω τὸ ὄνομά σου",
  },
  {
    ref: "Matt 6:10",
    text: "ἐλθέτω ἡ βασιλεία σου γενηθήτω τὸ θέλημά σου ὡς ἐν οὐρανῷ καὶ ἐπὶ γῆς",
  },
  {
    ref: "Matt 6:11",
    text: "τὸν ἄρτον ἡμῶν τὸν ἐπιούσιον δὸς ἡμῖν σήμερον",
  },
  {
    ref: "Matt 6:12",
    text: "καὶ ἄφες ἡμῖν τὰ ὀφειλήματα ἡμῶν ὡς καὶ ἡμεῖς ἀφήκαμεν τοῖς ὀφειλέταις ἡμῶν",
  },
  {
    ref: "Matt 6:13",
    text: "καὶ μὴ εἰσενέγκῃς ἡμᾶς εἰς πειρασμόν ἀλλὰ ῥῦσαι ἡμᾶς ἀπὸ τοῦ πονηροῦ",
  },
  // Mark 12:29-31 — Greatest Commandment (basic verbs, accusative)
  {
    ref: "Mark 12:29",
    text: "ἄκουε Ἰσραήλ κύριος ὁ θεὸς ἡμῶν κύριος εἷς ἐστιν",
  },
  {
    ref: "Mark 12:30a",
    text: "καὶ ἀγαπήσεις κύριον τὸν θεόν σου ἐξ ὅλης τῆς καρδίας σου",
  },
  {
    ref: "Mark 12:30b",
    text: "καὶ ἐξ ὅλης τῆς ψυχῆς σου καὶ ἐξ ὅλης τῆς διανοίας σου",
  },
  {
    ref: "Mark 12:30c",
    text: "καὶ ἐξ ὅλης τῆς ἰσχύος σου",
  },
  {
    ref: "Mark 12:31",
    text: "ἀγαπήσεις τὸν πλησίον σου ὡς σεαυτόν",
  },
  // Luke 2:10-14 — Christmas narrative (past tense, numbers context)
  {
    ref: "Luke 2:10",
    text: "μὴ φοβεῖσθε ἰδοὺ γὰρ εὐαγγελίζομαι ὑμῖν χαρὰν μεγάλην",
  },
  {
    ref: "Luke 2:11",
    text: "ὅτι ἐτέχθη ὑμῖν σήμερον σωτὴρ ὅς ἐστιν χριστὸς κύριος ἐν πόλει Δαυίδ",
  },
  {
    ref: "Luke 2:14",
    text: "δόξα ἐν ὑψίστοις θεῷ καὶ ἐπὶ γῆς εἰρήνη ἐν ἀνθρώποις εὐδοκίας",
  },
  // John 1:15-18
  {
    ref: "John 1:15",
    text: "Ἰωάννης μαρτυρεῖ περὶ αὐτοῦ καὶ κέκραγεν λέγων",
  },
  {
    ref: "John 1:15b",
    text: "οὗτος ἦν ὃν εἶπον ὁ ὀπίσω μου ἐρχόμενος ἔμπροσθέν μου γέγονεν",
  },
  {
    ref: "John 1:16",
    text: "ὅτι ἐκ τοῦ πληρώματος αὐτοῦ ἡμεῖς πάντες ἐλάβομεν καὶ χάριν ἀντὶ χάριτος",
  },
  {
    ref: "John 1:17",
    text: "ὅτι ὁ νόμος διὰ Μωϋσέως ἐδόθη ἡ χάρις καὶ ἡ ἀλήθεια διὰ Ἰησοῦ Χριστοῦ ἐγένετο",
  },
  {
    ref: "John 1:18",
    text: "θεὸν οὐδεὶς ἑώρακεν πώποτε μονογενὴς θεὸς ὁ ὢν εἰς τὸν κόλπον τοῦ πατρὸς ἐκεῖνος ἐξηγήσατο",
  },
  // John 3:16-17 — well-known, basic vocabulary
  {
    ref: "John 3:16a",
    text: "οὕτως γὰρ ἠγάπησεν ὁ θεὸς τὸν κόσμον",
  },
  {
    ref: "John 3:16b",
    text: "ὥστε τὸν υἱὸν τὸν μονογενῆ ἔδωκεν",
  },
  {
    ref: "John 3:16c",
    text: "ἵνα πᾶς ὁ πιστεύων εἰς αὐτὸν μὴ ἀπόληται ἀλλ' ἔχῃ ζωὴν αἰώνιον",
  },
  {
    ref: "John 3:17",
    text: "οὐ γὰρ ἀπέστειλεν ὁ θεὸς τὸν υἱὸν εἰς τὸν κόσμον ἵνα κρίνῃ τὸν κόσμον ἀλλ' ἵνα σωθῇ ὁ κόσμος δι' αὐτοῦ",
  },
  // Matthew 5:3-12 — Beatitudes (basic structure, adjectives, nouns)
  {
    ref: "Matt 5:3",
    text: "μακάριοι οἱ πτωχοὶ τῷ πνεύματι ὅτι αὐτῶν ἐστιν ἡ βασιλεία τῶν οὐρανῶν",
  },
  {
    ref: "Matt 5:4",
    text: "μακάριοι οἱ πενθοῦντες ὅτι αὐτοὶ παρακληθήσονται",
  },
  {
    ref: "Matt 5:5",
    text: "μακάριοι οἱ πραεῖς ὅτι αὐτοὶ κληρονομήσουσιν τὴν γῆν",
  },
  {
    ref: "Matt 5:6",
    text: "μακάριοι οἱ πεινῶντες καὶ διψῶντες τὴν δικαιοσύνην ὅτι αὐτοὶ χορτασθήσονται",
  },
  {
    ref: "Matt 5:7",
    text: "μακάριοι οἱ ἐλεήμονες ὅτι αὐτοὶ ἐλεηθήσονται",
  },
  {
    ref: "Matt 5:8",
    text: "μακάριοι οἱ καθαροὶ τῇ καρδίᾳ ὅτι αὐτοὶ τὸν θεὸν ὄψονται",
  },
  {
    ref: "Matt 5:9",
    text: "μακάριοι οἱ εἰρηνοποιοί ὅτι αὐτοὶ υἱοὶ θεοῦ κληθήσονται",
  },
  {
    ref: "Matt 5:10",
    text: "μακάριοι οἱ δεδιωγμένοι ἕνεκεν δικαιοσύνης ὅτι αὐτῶν ἐστιν ἡ βασιλεία τῶν οὐρανῶν",
  },
  // Romans 8:28 — common passage
  {
    ref: "Rom 8:28",
    text: "οἴδαμεν δὲ ὅτι τοῖς ἀγαπῶσιν τὸν θεὸν πάντα συνεργεῖ εἰς ἀγαθόν",
  },
  // 1 Corinthians 13:4-7 — Love chapter
  {
    ref: "1Cor 13:4a",
    text: "ἡ ἀγάπη μακροθυμεῖ χρηστεύεται ἡ ἀγάπη",
  },
  {
    ref: "1Cor 13:4b",
    text: "οὐ ζηλοῖ ἡ ἀγάπη οὐ περπερεύεται οὐ φυσιοῦται",
  },
  {
    ref: "1Cor 13:5",
    text: "οὐκ ἀσχημονεῖ οὐ ζητεῖ τὰ ἑαυτῆς οὐ παροξύνεται οὐ λογίζεται τὸ κακόν",
  },
  {
    ref: "1Cor 13:6",
    text: "οὐ χαίρει ἐπὶ τῇ ἀδικίᾳ συγχαίρει δὲ τῇ ἀληθείᾳ",
  },
  {
    ref: "1Cor 13:7",
    text: "πάντα στέγει πάντα πιστεύει πάντα ἐλπίζει πάντα ὑπομένει",
  },
  {
    ref: "1Cor 13:13",
    text: "νυνὶ δὲ μένει πίστις ἐλπίς ἀγάπη τὰ τρία ταῦτα μείζων δὲ τούτων ἡ ἀγάπη",
  },
  // Philippians 4:4-7
  {
    ref: "Phil 4:4",
    text: "χαίρετε ἐν κυρίῳ πάντοτε πάλιν ἐρῶ χαίρετε",
  },
  {
    ref: "Phil 4:6",
    text: "μηδὲν μεριμνᾶτε ἀλλ' ἐν παντὶ τῇ προσευχῇ καὶ τῇ δεήσει μετὰ εὐχαριστίας τὰ αἰτήματα ὑμῶν γνωριζέσθω πρὸς τὸν θεόν",
  },
  {
    ref: "Phil 4:7",
    text: "καὶ ἡ εἰρήνη τοῦ θεοῦ ἡ ὑπερέχουσα πάντα νοῦν φρουρήσει τὰς καρδίας ὑμῶν καὶ τὰ νοήματα ὑμῶν ἐν Χριστῷ Ἰησοῦ",
  },
  // Psalm 23:1-3 LXX (Psalm 22 in LXX numbering)
  {
    ref: "Ps 23:1 LXX",
    text: "κύριος ποιμαίνει με καὶ οὐδέν με ὑστερήσει",
  },
  {
    ref: "Ps 23:2 LXX",
    text: "εἰς τόπον χλόης ἐκεῖ με κατεσκήνωσεν ἐπὶ ὕδατος ἀναπαύσεως ἐξέθρεψέν με",
  },
  {
    ref: "Ps 23:3 LXX",
    text: "ψυχήν μου ἐπέστρεψεν ὡδήγησέν με ἐπὶ τρίβους δικαιοσύνης ἕνεκεν τοῦ ὀνόματος αὐτοῦ",
  },
  // Genesis 1:1-3 LXX
  {
    ref: "Gen 1:1 LXX",
    text: "ἐν ἀρχῇ ἐποίησεν ὁ θεὸς τὸν οὐρανὸν καὶ τὴν γῆν",
  },
  {
    ref: "Gen 1:2a LXX",
    text: "ἡ δὲ γῆ ἦν ἀόρατος καὶ ἀκατασκεύαστος",
  },
  {
    ref: "Gen 1:2b LXX",
    text: "καὶ σκότος ἐπάνω τῆς ἀβύσσου",
  },
  {
    ref: "Gen 1:3 LXX",
    text: "καὶ εἶπεν ὁ θεός γενηθήτω φῶς καὶ ἐγένετο φῶς",
  },
  // Matthew 28:19-20 — Great Commission
  {
    ref: "Matt 28:19",
    text: "πορευθέντες οὖν μαθητεύσατε πάντα τὰ ἔθνη βαπτίζοντες αὐτοὺς εἰς τὸ ὄνομα τοῦ πατρὸς καὶ τοῦ υἱοῦ καὶ τοῦ ἁγίου πνεύματος",
  },
  {
    ref: "Matt 28:20",
    text: "διδάσκοντες αὐτοὺς τηρεῖν πάντα ὅσα ἐνετειλάμην ὑμῖν καὶ ἰδοὺ ἐγὼ μεθ' ὑμῶν εἰμι πάσας τὰς ἡμέρας ἕως τῆς συντελείας τοῦ αἰῶνος",
  },
  // Revelation 21:3-4
  {
    ref: "Rev 21:3",
    text: "ἰδοὺ ἡ σκηνὴ τοῦ θεοῦ μετὰ τῶν ἀνθρώπων καὶ σκηνώσει μετ' αὐτῶν καὶ αὐτοὶ λαοὶ αὐτοῦ ἔσονται",
  },
  {
    ref: "Rev 21:4a",
    text: "καὶ ἐξαλείψει πᾶν δάκρυον ἐκ τῶν ὀφθαλμῶν αὐτῶν",
  },
  {
    ref: "Rev 21:4b",
    text: "καὶ ὁ θάνατος οὐκ ἔσται ἔτι οὔτε πένθος οὔτε κραυγὴ οὔτε πόνος οὐκ ἔσται ἔτι",
  },
  // Short curriculum-relevant phrases (conversation practice)
  {
    ref: "Curr. greeting",
    text: "χαῖρε ὦ φίλε τί ποιεῖς σήμερον",
  },
  {
    ref: "Curr. market",
    text: "θέλω ἀγοράσαι ἄρτον καὶ οἶνον",
  },
  {
    ref: "Curr. direction",
    text: "ποῦ ἐστιν ἡ ἀγορά παρακαλῶ",
  },
  {
    ref: "Curr. transaction",
    text: "πόσον ἐστίν ἔχω τρεῖς ὀβολούς",
  },
  {
    ref: "Curr. weather",
    text: "ὁ ἥλιος θερμός ἐστιν σήμερον",
  },
  {
    ref: "Curr. past",
    text: "ἐχθὲς ἠγόρασα ἰχθύας ἐν τῇ ἀγορᾷ",
  },
  {
    ref: "Curr. numbers",
    text: "εἷς δύο τρεῖς τέσσαρες πέντε",
  },
  {
    ref: "Curr. introduction",
    text: "ἐγώ εἰμι ξένος ὄνομά μοί ἐστιν",
  },
  {
    ref: "Curr. gratitude",
    text: "εὐχαριστῶ σοι πολύ ὦ φίλε",
  },
  {
    ref: "Curr. negation",
    text: "οὔ θέλω τοῦτο ἀλλὰ ἐκεῖνο θέλω",
  },
  {
    ref: "Curr. possession",
    text: "ἔχω ἄρτον καὶ ὕδωρ καὶ οἶνον",
  },
  {
    ref: "Curr. directions",
    text: "πορεύου πρὸς δεξιὰν καὶ βλέπεις τὸ ἱερόν",
  },
  {
    ref: "Curr. time of day",
    text: "πρωΐ ἐστιν καὶ ὁ ἥλιος ἀνατέλλει",
  },
  {
    ref: "Curr. buying fruit",
    text: "θέλω τρία μῆλα καὶ πέντε σῦκα παρακαλῶ",
  },
  {
    ref: "Curr. complaint",
    text: "ὁ οἶνος κακός ἐστιν θέλω ἄλλον οἶνον",
  },
  {
    ref: "Curr. farewell",
    text: "χαῖρε ὦ φίλε ἔρρωσο καλῶς",
  },
  {
    ref: "Curr. negotiation",
    text: "πολύ ἐστιν δίδωμί σοι πέντε ὀβολούς",
  },
  {
    ref: "Curr. daily routine",
    text: "πρωΐ πορεύομαι εἰς τὴν ἀγοράν καὶ ἀγοράζω ἄρτον",
  },
  {
    ref: "Curr. question where",
    text: "ποῦ ἐστιν ἡ οἰκία σου λέγε μοι",
  },
  {
    ref: "Curr. evening",
    text: "ἑσπέρα ἐστὶν καὶ ἡ νὺξ ἔρχεται",
  },
  {
    ref: "Curr. seeing",
    text: "βλέπω τὸν ἄνθρωπον ἐν τῇ ὁδῷ",
  },
  {
    ref: "Curr. hearing",
    text: "ἀκούω τὸν λόγον τοῦ ἀνθρώπου",
  },
  {
    ref: "Curr. knowing",
    text: "γινώσκω ὅτι ἀληθές ἐστιν τοῦτο",
  },
  {
    ref: "Curr. cold day",
    text: "ψυχρὸν ἐστιν σήμερον θέλω ὕδωρ θερμόν",
  },
  {
    ref: "Curr. fish buying",
    text: "λαμβάνω δύο ἰχθύας δίδωμί σοι τέσσαρας ὀβολούς",
  },
  {
    ref: "Curr. oil quality",
    text: "τὸ ἔλαιον ἀγαθόν ἐστιν πόσον ἐστίν",
  },
  {
    ref: "Curr. past purchase",
    text: "ἐχθὲς ἔλαβον ἄρτον καὶ κρέας ἐκ τῆς ἀγορᾶς",
  },
  {
    ref: "Curr. walking",
    text: "πορεύομαι εἰς τὸ ἱερὸν τοῦ Ἀπόλλωνος",
  },
  {
    ref: "Curr. speaking",
    text: "λέγω σοι τὴν ἀλήθειαν ἄκουέ μου",
  },
  {
    ref: "Curr. identity",
    text: "τί ἐστιν ὄνομά σου καὶ πόθεν εἶ",
  },
  {
    ref: "Curr. availability",
    text: "ἔχεις ἄρτον ἢ οἶνον ἢ ἔλαιον",
  },
  {
    ref: "Curr. grape purchase",
    text: "ἠγόρασα σταφυλὰς καὶ μῆλα ἐν τῇ ἀγορᾷ σήμερον",
  },
  {
    ref: "Curr. road question",
    text: "ποῦ ἐστιν ἡ ὁδὸς ἡ πρὸς τὸν λιμένα",
  },
  {
    ref: "Curr. existence",
    text: "ἐγώ εἰμι ἄνθρωπος σὺ δὲ τίς εἶ",
  },
];

// ---------------------------------------------------------------------------
// Vocabulary extraction (Ch 1-3 only)
// ---------------------------------------------------------------------------

/**
 * Extract Greek vocabulary words from seed chapters, filtered to specified
 * chapter numbers. Returns deduplicated list of Greek words.
 */
export function extractChapterVocabulary(
  chapterNumbers: number[]
): string[] {
  const words = new Set<string>();
  const targetChapters = seedChapters.filter((ch) =>
    chapterNumbers.includes(ch.chapterNumber)
  );

  for (const chapter of targetChapters) {
    for (const entry of chapter.targetVocabulary) {
      // Take everything before the first '(' or ' -'
      let greekPart = entry.split("(")[0].split(" -")[0].trim();

      // Handle entries like "εἷς, δύο, τρεῖς, τέσσαρες, πέντε"
      if (greekPart.includes(",")) {
        const parts = greekPart.split(",").map((p) => p.trim());
        for (const part of parts) {
          if (part && /[\u0370-\u03FF\u1F00-\u1FFF]/.test(part)) {
            words.add(part);
          }
        }
      } else if (
        greekPart &&
        /[\u0370-\u03FF\u1F00-\u1FFF]/.test(greekPart)
      ) {
        words.add(greekPart);
      }
    }
  }

  return Array.from(words);
}

// ---------------------------------------------------------------------------
// IPA lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up IPA for a single Greek word. Returns IPA string or "[MANUAL_IPA]"
 * if the word is not in the pronunciation dictionary.
 */
export function getIPA(
  dict: PronunciationDictionary,
  word: string
): string {
  const entry = lookupWord(dict, word);
  return entry ? entry.ipa : "[MANUAL_IPA]";
}

/**
 * Build an IPA transcription for a multi-word prompt.
 * Each word is looked up individually and joined with spaces.
 * Words not found are marked with [MANUAL_IPA].
 */
export function getPromptIPA(
  dict: PronunciationDictionary,
  prompt: string
): string {
  const words = prompt
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.replace(/[.,;:·!?]/g, "")); // strip punctuation for lookup

  return words.map((w) => getIPA(dict, w)).join(" ");
}

// ---------------------------------------------------------------------------
// Prompt segmentation
// ---------------------------------------------------------------------------

/**
 * Segment a long sentence into recording prompts at natural clause
 * boundaries. Targets MIN_PROMPT_WORDS to MAX_PROMPT_WORDS per segment.
 */
export function segmentText(text: string): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  // If already within bounds, return as-is
  if (words.length <= MAX_PROMPT_WORDS) {
    return [words.join(" ")];
  }

  // Split at clause boundaries (καί, ὅτι, ἵνα, ἀλλά, or commas/semicolons)
  const clauseBoundaries = /^(καί|καὶ|ὅτι|ἵνα|ἀλλά|ἀλλ')$/;
  const segments: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    // Check if this word starts a new clause and current segment is long enough
    if (
      current.length >= MIN_PROMPT_WORDS &&
      clauseBoundaries.test(word)
    ) {
      segments.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }

    // Force split if we hit max
    if (current.length >= MAX_PROMPT_WORDS) {
      segments.push(current.join(" "));
      current = [];
    }
  }

  if (current.length > 0) {
    // If remaining segment is too short, merge with previous
    if (current.length < MIN_PROMPT_WORDS && segments.length > 0) {
      segments[segments.length - 1] += " " + current.join(" ");
    } else {
      segments.push(current.join(" "));
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Duration estimation
// ---------------------------------------------------------------------------

/**
 * Estimate recording duration in seconds for a prompt based on word count.
 * Uses a conservative speaking rate for careful Greek pronunciation.
 */
export function estimateDuration(prompt: string): number {
  const wordCount = prompt.split(/\s+/).filter((w) => w.length > 0).length;
  // Individual vocab words get a minimum of 2 seconds (say + pause)
  if (wordCount <= 2) return 2;
  return wordCount / WORDS_PER_SECOND;
}

// ---------------------------------------------------------------------------
// Prompt generation
// ---------------------------------------------------------------------------

export interface Prompt {
  id: string;
  type: "vocab" | "passage";
  ref: string;
  text: string;
  ipa: string;
  estimatedSeconds: number;
  manualIpaNeeded: boolean;
}

/**
 * Generate all recording prompts for Ch 1-3 curriculum.
 */
export function generatePrompts(dict: PronunciationDictionary): Prompt[] {
  const prompts: Prompt[] = [];
  let idCounter = 1;

  // 1. Individual vocabulary word prompts (base forms)
  const vocab = extractChapterVocabulary(CHAPTERS_TO_INCLUDE);
  for (const word of vocab) {
    const ipa = getIPA(dict, word);
    prompts.push({
      id: `vocab_${String(idCounter++).padStart(4, "0")}`,
      type: "vocab",
      ref: `Ch1-3 vocab`,
      text: word,
      ipa,
      estimatedSeconds: estimateDuration(word),
      manualIpaNeeded: ipa === "[MANUAL_IPA]",
    });
  }

  // 1b. Inflected form prompts from pronunciation dictionary
  // For each Ch 1-3 vocab word found in the dictionary, also add its inflections
  for (const word of vocab) {
    const entry = lookupWord(dict, word);
    if (entry && entry.inflections.length > 0) {
      for (const inflection of entry.inflections) {
        // Look up the inflection's own IPA (may map back to base entry)
        const inflIpa = getIPA(dict, inflection);
        prompts.push({
          id: `vocab_${String(idCounter++).padStart(4, "0")}`,
          type: "vocab",
          ref: `Ch1-3 inflection`,
          text: inflection,
          ipa: inflIpa,
          estimatedSeconds: estimateDuration(inflection),
          manualIpaNeeded: inflIpa === "[MANUAL_IPA]",
        });
      }
    }
  }

  // 2. Passage prompts from SBLGNT
  for (const passage of SBLGNT_PASSAGES) {
    const segments = segmentText(passage.text);
    for (const segment of segments) {
      const ipa = getPromptIPA(dict, segment);
      prompts.push({
        id: `passage_${String(idCounter++).padStart(4, "0")}`,
        type: "passage",
        ref: passage.ref,
        text: segment,
        ipa,
        estimatedSeconds: estimateDuration(segment),
        manualIpaNeeded: ipa.includes("[MANUAL_IPA]"),
      });
    }
  }

  return prompts;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/**
 * Format prompts as plain text for Piper Recording Studio.
 * One prompt per line, format: id|text
 */
export function formatPromptsText(prompts: Prompt[]): string {
  return prompts.map((p) => `${p.id}|${p.text}`).join("\n") + "\n";
}

/**
 * Format prompts as TSV with IPA reference for recording guide.
 * Columns: id, type, ref, text, ipa, duration_s, manual_ipa_needed
 */
export function formatPromptsTSV(prompts: Prompt[]): string {
  const header =
    "id\ttype\tref\ttext\tipa\tduration_s\tmanual_ipa_needed";
  const rows = prompts.map(
    (p) =>
      `${p.id}\t${p.type}\t${p.ref}\t${p.text}\t${p.ipa}\t${p.estimatedSeconds.toFixed(1)}\t${p.manualIpaNeeded}`
  );
  return [header, ...rows].join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function generateSummary(prompts: Prompt[]): string {
  const vocabPrompts = prompts.filter((p) => p.type === "vocab");
  const passagePrompts = prompts.filter((p) => p.type === "passage");
  const totalSpeakingSeconds = prompts.reduce(
    (sum, p) => sum + p.estimatedSeconds,
    0
  );
  const totalSessionSeconds =
    totalSpeakingSeconds * RECORDING_OVERHEAD_MULTIPLIER;
  const manualIpaCount = prompts.filter((p) => p.manualIpaNeeded).length;

  return [
    "=== KEP Self-Recording Prompts Summary ===",
    "",
    `Total prompts: ${prompts.length}`,
    `  Vocabulary word prompts: ${vocabPrompts.length}`,
    `  Passage prompts: ${passagePrompts.length}`,
    "",
    `Estimated pure speaking time: ${(totalSpeakingSeconds / 60).toFixed(1)} minutes`,
    `  (at ~${WORDS_PER_SECOND} words/second speaking rate)`,
    `Estimated total session time: ${(totalSessionSeconds / 60).toFixed(1)} minutes`,
    `  (includes pauses, re-takes, setup — ${RECORDING_OVERHEAD_MULTIPLIER}x multiplier)`,
    "",
    `Prompts needing manual IPA lookup: ${manualIpaCount}`,
    "",
    "SBLGNT License: CC-BY 4.0",
    "Attribution: Holmes, Michael W. The Greek New Testament: SBL Edition.",
    "  Logos Bible Software / Society of Biblical Literature, 2010.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main(dryRun = false): void {
  console.log("Loading pronunciation dictionary...");
  const dict = loadDictionary();

  console.log("Generating recording prompts for Ch 1-3...");
  const prompts = generatePrompts(dict);

  const summary = generateSummary(prompts);
  console.log(summary);

  if (dryRun) {
    console.log("[DRY RUN] Skipping file output.");
    return;
  }

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write prompts.txt (Piper Recording Studio format)
  const promptsPath = join(OUTPUT_DIR, "prompts.txt");
  writeFileSync(promptsPath, formatPromptsText(prompts), "utf-8");
  console.log(`Written: ${promptsPath}`);

  // Write prompts-with-ipa.tsv (recording guide)
  const tsvPath = join(OUTPUT_DIR, "prompts-with-ipa.tsv");
  writeFileSync(tsvPath, formatPromptsTSV(prompts), "utf-8");
  console.log(`Written: ${tsvPath}`);

  // Write LICENSE notice
  const licensePath = join(OUTPUT_DIR, "LICENSE-SBLGNT.txt");
  writeFileSync(
    licensePath,
    [
      "SBLGNT Text License",
      "===================",
      "",
      "The Greek New Testament passages included in this directory are from the",
      "SBL Greek New Testament (SBLGNT), used under the Creative Commons",
      "Attribution 4.0 International License (CC BY 4.0).",
      "",
      "Attribution:",
      "  Holmes, Michael W. The Greek New Testament: SBL Edition.",
      "  Logos Bible Software and the Society of Biblical Literature, 2010.",
      "  https://sblgnt.com",
      "",
      "License: https://creativecommons.org/licenses/by/4.0/",
      "",
    ].join("\n"),
    "utf-8"
  );
  console.log(`Written: ${licensePath}`);
}

// Run if executed directly
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

if (
  process.argv[1]?.includes("prepare-recording-prompts") &&
  !process.argv[1]?.includes(".test.")
) {
  main(isDryRun);
}
