# Vietnam theatre — source dossier: "what WAS Vietnam"

Status: research and design document, checked 2026-08-06. No runtime changes, no build stamp.

This is the historical half of the Vietnam theatre research. It is a **reference for authenticity**:
what the machines were, what the paperwork looked like, what the contracts said, how people
actually talked, what things were called. It follows the project's standing doctrine —
sourced-not-invented, estimates explicitly labelled — and applies the `source-driven-development`
discipline to history rather than to framework docs: every factual claim carries a citation, and
anything that could not be substantiated is labelled rather than asserted.

**It is not a thesis and the game does not argue one.** The register is observational and deadpan.
The reference the owner gave is *Full Metal Jacket* — specifically the *Stars and Stripes* newsroom
scene, where how the war gets written up versus what happened is transacted as routine office
business, unremarked. That is the target for briefing text, contractor euphemism and radio traffic:
institutional voice, flatly reported. No reckoning, no reveal, no engineered moment of
significance.

Where this document would be tempted to say "this lets the game say X", it says "this is what X
actually was" and stops.

Companion documents: [`adr-0003-ghibli-adjacent-world-presentation.md`](../../adr-0003-ghibli-adjacent-world-presentation.md)
(art direction and the instrument-honesty contract). The "what COULD Vietnam be" 2032 half is not
yet written; section 9 covers only the naming question it raises.

## How to read the labels

Every substantive claim carries one of four labels.

- **DOCUMENTED** — established in a primary source or an authoritative institutional history, cited
  inline. Safe to build on.
- **CONTESTED** — serious historians disagree, or the evidence supports a range. The disagreement
  is stated. Build on it only if the design can carry the ambiguity.
- **ESTIMATE** — a number with a real range and a named methodology. Never quote the midpoint alone.
- **UNVERIFIED** — in circulation, frequently repeated, but I could not run it to an authoritative
  source. Do not put it in a briefing screen, a loading-screen fact, or any player-facing text.

A fifth category, **OUR INVENTION**, marks anything the game would be making up. Section 10 keeps
these separate so the line never blurs.

## One structural note, up front

**No revelation plot.** No discover-the-terrible-truth arc, no document hunt, no mask-drop. Not
because that would be unsophisticated, but because it is inaccurate: the material below shows an
apparatus in which the relevant facts were already circulating, internally and publicly, while the
work continued. A plot built on concealment would be authoring a fictional epistemology on top of a
well-documented real one. Briefings are honest enough. Instruments are truthful — ADR-0003 mandates
that anyway. Nothing is being revealed and nobody is being taught.

---

## 1. The Pentagon Papers and Daniel Ellsberg

### 1.1 What the document physically was

**DOCUMENTED.** Official title: *Report of the Office of the Secretary of Defense Vietnam Task
Force*. Commissioned by Secretary of Defense **Robert S. McNamara in June 1967** and completed about
eighteen months later. It covers US involvement in Vietnam **from 1940 through 1967**. The full
record held by the National Archives runs to **48 boxes, approximately 7,000 pages**; it is
commonly described as a 47-volume study. Classified Top Secret – Sensitive.
([National Archives, "Pentagon Papers"](https://www.archives.gov/research/pentagon-papers))

The complete, unredacted study was released by NARA together with the Kennedy, Johnson and Nixon
Presidential Libraries on the **40th anniversary in June 2011**; approximately **34%** of the
material became public for the first time then. **DOCUMENTED**, same source.

The detail worth keeping: **the man prosecuting the war commissioned the internal history of it,
while prosecuting it.** The study was not an exposé produced by opponents. It was staff work. Its
30–40 authors were, in Arendt's phrase, the same class of people who were running the war —
"remarkably free from the sins of the ideologists; they believed in methods but not in 'world
views,' which, incidentally, is the reason why they could be trusted 'to pull together the
Pentagon's documentary record'".
([Arendt, *Lying in Politics*](https://web.english.upenn.edu/~cavitch/pdf-library/Arendt_Lying_in_Politics_1971.pdf))

### 1.2 Ellsberg's career — the useful biography

All **DOCUMENTED** from the Federal Judicial Center's teaching volume *The Pentagon Papers in the
Federal Courts* (2nd ed., 2019), a US federal government publication:
[fjc.gov PDF](https://www.fjc.gov/sites/default/files/trials/The%20Pentagon%20Papers%20in%20the%20Federal%20Courts%202e_2019_1.pdf)

- Harvard economics PhD (1962); as a graduate student he lectured on the use of irrational military
  threats in a seminar taught by **Henry Kissinger**.
- US Marine Corps; honourably discharged 1959.
- Joined the **RAND Corporation in 1959**, working on nuclear-war problems. Began consulting for the
  Pentagon two years later; **left RAND in 1964 to work full-time for the Defense Department**, on
  Vietnam exclusively. He **helped plan the dispatch of US ground troops in 1965**.
- Requested to go to Vietnam as a Marine company commander in 1966 and was refused as too senior a
  civilian; went instead with a State Department group, studying the **pacification programme** and
  going on patrols, "during which he was occasionally caught in combat."
- By 1967 he had concluded the US should withdraw. **That same year he joined the Pentagon Papers
  project**, writing the Kennedy-administration section.
- 1969: asked by RAND to write a paper for Kissinger setting out the new Nixon administration's
  Vietnam options. He requested and was granted access to the entire study, read it, and began
  photocopying it at the RAND office in Santa Monica.
- He tried official channels first — he urged Kissinger to read the full report, and gave excerpts
  to antiwar members of Congress including **George McGovern**. None would release it.
- **March 1971**: delivered the photocopies to *New York Times* reporter **Neil Sheehan**.

The shape of that career is the usable material: a man who planned the ground-troop deployment,
wrote part of the official history, and was one of very few people cleared to read all of it.

### 1.3 What he said he was trying to do

Interviewed by *Reason* in June 1973 while awaiting trial, reproduced in the FJC volume:

> "The only thing that I could personally hope to achieve by my own efforts was to make these
> documents available to the American public for them to read and to learn from. I couldn't force
> them to read the documents — let alone to learn from and act on them — but I could hope to make it
> possible for them to read them as opposed to the situation where the studies were sitting in my
> safe at the Rand Corporation. In that situation I was almost the only person in the country
> authorized to study and derive lessons from them. The theory was that those lessons would be put
> to use by the Executive Branch. But what the Pentagon Papers told me when I read them was that the
> Executive Branch was determined not to learn lessons from its experience in Vietnam."
> — Ellsberg, *Reason* vol. 5 no. 2, June 1973, pp. 5–18. **DOCUMENTED**

### 1.4 What the *Times* actually printed on 13 June 1971

The FJC volume reproduces the *Times*'s own summary of the study's broad findings (Neil Sheehan,
"Vietnam Archive: Pentagon Study Traces 3 Decades of Growing U.S. Involvement", *N.Y. Times*, 13
June 1971, p. 1). **DOCUMENTED.** The findings that matter for setting detail:

- Clandestine US raids on North Vietnam had been running **for months before** the August 1964
  Tonkin Gulf Resolution authorised escalation.
- The Tonkin Gulf Resolution **had been drafted in advance** of the attacks that ostensibly prompted
  it. See section 2.
- By **September 1964** the administration had decided bombing North Vietnam would be necessary,
  while Johnson campaigned on restraint against Goldwater.
- **April 1965**: Johnson decided to use US ground troops offensively while concealing the change.
- The clandestine pressure through 1964 and the 1965 bombing programme were begun "despite the
  judgment of the Government's intelligence community that the measures would not cause Hanoi to
  cease its support of the Vietcong insurgency in the South, and that the bombing was deemed
  militarily ineffective within a few months."
- Covert warfare from 1954 onward; encouragement of the 1963 overthrow of **Ngo Dinh Diem**; and the
  1965 calculation "that neither accommodation inside South Vietnam nor early negotiations with
  North Vietnam would achieve the desired result."

Note the register of the study's own vocabulary in these quotations — "limited-risk gamble", "broad
commitment", "direct role in the ultimate breakdown". This is the language of internal staff work,
and it is the correct register for the game's briefing text. It is not sinister. It is administrative.

### 1.5 The legal aftermath — dates and outcomes

**DOCUMENTED**, FJC volume:

- *New York Times Co. v. United States*, decided **30 June 1971**, brief **per curiam**, **6–3**: the
  government had not met the heavy burden of justifying a prior restraint. All nine justices wrote
  separately.
- Late June 1971: federal grand jury in Los Angeles indicted Ellsberg for theft and espionage; a
  revised indictment added charges and named **Anthony Russo** as co-conspirator.
- January 1973: trial before **Judge Matthew Byrne**, C.D. Cal.
- The White House had formed a special unit, **"the Plumbers"**, to deter further leaks and gather
  information on Ellsberg and Russo. Members conducted electronic surveillance of Ellsberg and
  **broke into the Los Angeles office of Ellsberg's psychiatrist** looking for his records.
- Byrne had met at least twice with **John Ehrlichman**, and once with **Nixon**, about being
  appointed director of the FBI — during the trial.
- **May 1973**: Byrne dismissed the charges, holding that "the bizarre events have incurably
  infected the prosecution of this case."
- Two Plumbers, **E. Howard Hunt** and **G. Gordon Liddy**, went on to the Democratic Party
  surveillance that became Watergate.

### 1.6 What the leak changed, and what it did not — the honest ledger

This is the part that resists a tidy story, so it is set out as evidence rather than argument.

**Did not change:** the war continued. US combat activity in Southeast Asia ran until **15 August
1973** and the war ended with the fall of Saigon on **30 April 1975**
([US Dept. of State, Office of the Historian](https://history.state.gov/milestones/1969-1976/ending-vietnam)).
After June 1971 the Nixon administration mined North Vietnam's harbours and opened **Operation
Linebacker** (decision of 4 May 1972), and conducted the December 1972 "Christmas Bombing" before
negotiations resumed on 8 January 1973 (same source). **DOCUMENTED.**

**Was already moving before the leak:** the shift in American opinion long preceded publication.
Gallup's "mistake" question: **24%** said sending troops was a mistake in **1965**; a plurality said
mistake by **October 1967** (47% to 44%); the **first majority was August 1968 at 53%**; the figure
averaged **55%** in 1969–70 and reached **60%** in 1971 and 1973
([Gallup](https://news.gallup.com/poll/18097/iraq-versus-vietnam-comparison-public-opinion.aspx)).
**DOCUMENTED.** The Pentagon Papers were published in June 1971 — roughly three years after majority
opinion had already turned.

Congress had also already acted. The **Senate voted 81–10 to repeal the Tonkin Gulf Resolution on
24 June 1970**, a year before publication (see section 2.4 for sourcing caveat). The
**Cooper–Church** restriction on operations in Cambodia was enacted **5 January 1971**, also before
publication.

**Did change, by an indirect route:** Nixon's response to the leak produced the Plumbers, and the
Plumbers produced Watergate and the end of his presidency (section 1.5). The most consequential
effect of the leak documented in the record runs through the *reaction* to it, not through its
contents. **DOCUMENTED.**

**CONTESTED:** how much causal weight to give the Papers in the 1973 congressional restrictions
(Case–Church, the War Powers Resolution) versus the accumulated effect of Cambodia, Tet, casualties
and the draft. Historians disagree and I did not find a source that settles it. Do not assert a
causal chain here.

Arendt's own summary of the contents question — that the Papers "revealed hardly any spectacular
news" — is her judgement, offered five months after publication, and is **her argument, not an
established fact**. It is quoted here because it is a well-informed contemporary reading, not
because it is settled. **CONTESTED.**

---

## 2. The Gulf of Tonkin

### 2.1 What was said publicly

Johnson's address to the nation, **4 August 1964**:

> "The initial attack on the destroyer *Maddox*, on August 2, was repeated today by a number of
> hostile vessels attacking two U.S. destroyers with torpedoes."

> "Air action is now in execution against gunboats and certain supporting facilities in North
> Viet-Nam which have been used in these hostile operations."

> "We still seek no wider war."

**DOCUMENTED** ([Miller Center, presidential speeches](https://millercenter.org/the-presidency/presidential-speeches/august-4-1964-report-gulf-tonkin-incident)).
He described the response as "limited and fitting".

### 2.2 The Resolution

**DOCUMENTED** ([National Archives, Milestone Documents](https://www.archives.gov/milestone-documents/tonkin-gulf-resolution)).
Dated **7 August 1964**. Passed with **only two senators dissenting — Wayne Morse and Ernest
Gruening**. Signed 10 August.

The operative text — worth having verbatim, because the euphemism is doing structural work:

> "Whereas naval units of the Communist regime in Vietnam have deliberately and repeatedly attacked
> United States naval vessels lawfully present in international waters…"

> "…Congress approves and supports the determination of the President, as Commander in Chief, to
> take all necessary measures to repel any armed attack against the forces of the United States and
> to prevent further aggression."

Section 3 provided that the resolution would expire "when the President shall determine that the
peace and security of the area is reasonably assured", or earlier by concurrent resolution. There
is no declaration of war anywhere in it.

### 2.3 What was later established

**DOCUMENTED.** The 2 August 1964 engagement occurred. The **4 August attack did not.** The NSA
declassified over 140 formerly top-secret documents on the incident, including Robert J. Hanyok's
*Skunks, Bogies, Silent Hounds, and the Flying Fish: The Gulf of Tonkin Mystery, 2–4 August 1964*,
originally published in the NSA's classified *Cryptologic Quarterly* in 2001 and declassified in
November 2005. Hanyok's finding is that the SIGINT cited as confirmation of the 4 August attack
consisted of intercepts relating to the recovery of boats damaged on 2 August, **re-dated,
re-translated and selectively excerpted**.
([NSA declassification page](https://www.nsa.gov/Helpful-Links/NSA-FOIA/Declassification-Transparency-Initiatives/Internal-Periodicals-Publications/Legacy-Periodicals-Lists/igphoto/2002751691/);
[National Security Archive briefing book 132](https://nsarchive2.gwu.edu/NSAEBB/NSAEBB132/))

**CONTESTED — and the distinction matters.** Whether the SIGINT handling was *deliberate deception*
or *rationalisation under pressure* is disputed. Hanyok's own framing and the National Security
Archive's presentation differ in emphasis from the more prosecutorial popular accounts. Do not put
"they faked it" in player-facing text; the defensible statement is that the intelligence presented
to Congress did not support the event it was cited for.

The Miller Center's account of the contemporaneous record: the 2 August engagement was publicly
characterised as "unprovoked aggression" while Johnson and McNamara privately conceded that US
covert operations "probably provoked the North Vietnamese"; on 4 August, as reporting arrived, "the
story became more and more confused"; and by the time Johnson signed the resolution on 10 August,
"several senior officials — and probably the president himself — had concluded that the attack of
August 4 had likely not occurred."
([Miller Center](https://millercenter.org/the-presidency/educational-resources/tonkin-gulf)) **DOCUMENTED.**

The relevant primary audio is public: the LBJ telephone recordings and the National Military Command
Center tapes for 4 August 1964, at the [Miller Center Gulf of Tonkin recordings](https://millercenter.org/gulf-tonkin-recordings)
and [NSA Archive tapes page](https://nsarchive2.gwu.edu/NSAEBB/NSAEBB132/tapes.htm). Anyone writing
radio dialogue for this theatre should listen to them: the register of senior officials handling a
confused tactical picture in real time is exactly the tone the *Stars and Stripes* model wants, and
it is available in the actual voices.

### 2.4 The pre-drafted resolution

**DOCUMENTED**, FJC volume: the Tonkin Gulf Resolution "had been drafted in advance of the purported
North Vietnamese attacks on U.S. Navy ships that had ostensibly served as the basis for
congressional action", and "the Johnson administration had been awaiting an opportune time to
introduce it."

Senator Ernest Gruening, in a 1971 televised debate reproduced in the same volume, put it as: the
resolution "had been drafted months before by an assistant Secretary of State before the Tonkin Gulf
episode happened." **The specific attribution to an assistant Secretary of State is Gruening's
characterisation, in a debate, and is CONTESTED** — the drafting is usually credited to Assistant
Secretary of State **William P. Bundy**, but I could not run that attribution to a primary document
and it is marked **UNVERIFIED** here.

**DOCUMENTED**, same volume: Senator George McGovern in the Senate on 17 June 1971 (117 Cong. Rec.
20634) documented that McNamara had told the Foreign Relations Committee on **20 February 1968**
that operations against the North "were under the command of the South Vietnamese and were carried
out by the South Vietnamese. There were no U.S. personnel participating in it, to the best of my
knowledge" — against the Papers' record of "an elaborate program of covert military operations
against the state of North Vietnam" from **1 February 1964**, run through a Joint Chiefs section
called the **Office of the Special Assistant for Counterinsurgency and Special Activities**.

That office name is a genuine artefact and exactly the sort of thing this project should use rather
than invent. See the do-not-invent list, section 10.

**Repeal.** The Senate voted **81–10 on 24 June 1970** to repeal the resolution, on an amendment by
Senator **Robert Dole** to the Foreign Military Sales Act; the repeal took effect when the Act was
signed on **12 January 1971**. **UNVERIFIED AS TO SOURCING** — I could reach only secondary accounts
and GovTrack for this; the Senate Historical Office page returned 403. The dates and vote counts are
consistent across the sources I found but should be re-checked against the Congressional Record
before appearing in player-facing text.


---


---

## 3. Brown & Root and RMK-BRJ — the contractor war

Primary sources throughout this section, both downloaded and text-extracted:

- **GAO / Comptroller General, B-159451, *United States Construction Activities in the Republic of
  Viet Nam*, 15 May 1967** — https://www.gao.gov/assets/b-159451.pdf
- **Tregaskis & Bingham, *Southeast Asia: Building the Bases — The History of Construction in
  Southeast Asia*, US Navy / NAVFAC official history (GPO, 1975)** —
  https://www.history.navy.mil/content/dam/museums/Seabee/Online%20Reading%20Room/Manuals%20and%20Publications/Publications/Southeast%20Asia,%20Building%20The%20Bases,%20A%20History%20Of%20Const.pdf

Both are OCR'd scans; quotations should be spot-checked against page images before appearing in
shipped text.

### 3.1 What it was, and the two-stage formation

**DOCUMENTED.** This is the most commonly garbled fact about RMK-BRJ: it was **not** a four-firm
venture from the start. GAO B-159451, p. 7:

> "On January 19, 1962, a joint-venture—comprising Raymond International of Delaware, Inc., and
> Morrison-Knudsen of Asia, Inc.; and known as RMK—was awarded a cost-plus-fixed-fee contract to
> construct four projects in Viet Nam at an estimated cost of $21.5 million."

> "The work had increased to such an extent that **the contractor recommended to the Department of
> the Navy that the joint venture be enlarged** to include Brown & Root, Inc., and J. A. Jones
> Construction Company. The recommendation was approved and on **August 3, 1965**, the joint venture
> was enlarged to its present status and its name was changed to RMK-BRJ."

The 1961 selection was made by a Bureau of Yards and Docks board at San Bruno, California, from five
competing combines — including J. A. Jones, which lost in 1961 and joined the winner in 1965
(NAVFAC history). Contract number **NBy-44105**.

**Contracting authority**, three layers (GAO pp. 6–7): the **Officer in Charge of Construction,
Republic of Viet Nam (OICC)**, a NAVFAC representative, as "the principal construction agent for the
United States military services"; above it **MACV**, responsible since January 1966 "for control and
direction of obligational authority for all military construction activities"; and the Bureau of
Yards and Docks (BUDOCKS), redesignated **Naval Facilities Engineering Command (NAVFAC)** in 1966.

**Contract type — and the change that matters.** CPFF first, CPAF from May 1966:

> "In May 1966, due to the still expanding scope of the work assigned to the contractor, the contract
> was converted from a cost-plus-fixed-fee contract with a fixed fee of 3 percent to a
> cost-plus-award-fee contract." (GAO p. 7)

Base fee **1.7%** plus award fee up to **0.76%**, maximum 2.46%, with the award portion set by
"semi-annual performance evaluations made by a board of three senior Navy Officers" grading "quality
of work, management, performance, and cost." First rating: **81.3%**, award fee **$649,094**.

**DOCUMENTED and genuinely notable — this was the first US use of civilian contractors in an active
combat zone.** NAVFAC history:

> "This was to be the first time that a civilian construction force would be employed in an active
> combat zone. The Seabees were created in 1942 because it was not feasible to use contractor forces
> in the forward areas during World War II. There were many reasons for this, principally that a
> civilian worker captured carrying a weapon, could be shot as a guerrilla."

Casualties: **52 RMK-BRJ employees killed, 248 injured by enemy action** (NAVFAC). One employee,
James Uhland Rollins, was captured in Cho Lon on 5 February 1968 and released with the first group of
POWs on 12 February 1973.

### 3.2 Scale

**Money — DOCUMENTED.** Initial contract $21.5m (Jan 1962) → $155.4m scope (Aug 1965) →
**$823m authorized across 38 major sites at 1 October 1966**, against $807.8m obligations, $628.5m
expenditures and $337.4m work in place (GAO pp. 7–10). Combined US construction program in Vietnam
at that date: **$1.3bn**.

**The widely-cited "$1.9 billion" RMK-BRJ total is a POPULAR CLAIM I COULD NOT VERIFY.** It is not in
either primary document. What the NAVFAC official history says is broader: "the more-than-two-billion
dollars spent on our building effort in Vietnam." **Use "$823 million authorized to RMK-BRJ as of 1
October 1966" (GAO) or "more than $2 billion for the whole US construction effort" (NAVFAC). Do not
use $1.9 billion.**

**Employment — DOCUMENTED, exact (GAO p. 61).** Peak at **31 July 1966: 51,044 total** —
**Americans 4,019 · Third country nationals 5,739 · Vietnamese 41,286.** TCNs were recruited through
dedicated offices in Seoul and Manila.

**The three-tier wage structure is the single most usable fact in this section**, stated flatly in an
audit document (GAO pp. 61–62):

> "Americans working as engineers and administrators and in related fields receive monthly salaries
> ranging from $600 for secretaries to $2,000 for engineers… The base monthly salaries paid to Korean
> and Filipino third country nationals working for the contractor range from $225 for clerk typists
> to $450 for senior engineers."

> "We noted that the contractor had employed Vietnamese workers on an hourly wage-rate basis… The
> hourly wage ranged from 12 Vietnamese piasters ($0.10) for an unskilled laborer to 117.7 Vietnamese
> piasters for a chief accountant ($1)."

Three nationalities, three formally distinct pay scales, one worksite. Also: "with the exception of
Vietnamese personnel, contractor employees are paid on a monthly salary basis and no provision is
made for payment of overtime, even though work was scheduled at a minimum of 60 hours or more a week."

**What they built — DOCUMENTED** (GAO p. 10): a 10,000-foot aluminium-mat expeditionary runway at
**Cam Ranh Bay completed in 66 days**; permanent runways at Phan Rang, Da Nang, Chu Lai and Cam Ranh
Bay; 4 berths at Da Nang and 2 at Saigon, 10 LST ramps; **6,255,000 cubic metres of dredging**;
housing for 80,000 troops completed in 1966 with another 145,000 partially complete; **over 2.5
million square yards of airfield pavement**; over 1 million barrels of POL storage. Concurrently:
"4 deep-water ports simultaneously; 7 jet capable airfields; dredging at 14 different locations."

Equipment at peak: **5,260 pieces valued at $109.1 million.**

### 3.3 The Brown brothers and Lyndon Johnson — **THIN, AND THE HEADLINE CLAIM DOES NOT SURVIVE**

This section is deliberately short because the research did not reach the standard the rest of the
document meets. **Treat it as a stub to be re-run, not as a finding.**

**DOCUMENTED** (Texas State Historical Association, *Handbook of Texas*):
- Herman Brown founded the firm on capital from his brother-in-law: "In 1919 his brother-in-law, Dan
  Root, advanced him money for working capital, and the company was named Brown and Root,
  Incorporated." — https://www.tshaonline.org/handbook/entries/brown-herman
- **Marshall Ford Dam:** "a successful joint bid in 1936 to construct the Marshall Ford Dam (now
  Mansfield Dam) on the Colorado River." — same entry.
- **George Brown and LBJ:** George Brown was "a well-known friend and visible supporter of Lyndon B.
  Johnson throughout his political career." —
  https://www.tshaonline.org/handbook/entries/brown-george-rufus
- Herman Brown died 15 November 1962.

**A finding about the sources themselves:** the TSHA entry on **Herman Brown contains no mention of
Lyndon Johnson at all.** The scholarly reference works are markedly quieter on the Brown–Johnson
relationship than the polemical literature is. That asymmetry is itself a fact about the record.

**NOT VERIFIED — do not assert:** the congressional appropriations manoeuvre by which LBJ secured
funding for Marshall Ford Dam; the dollar value of Brown & Root's dam contracts; Brown & Root
contributions to the 1941 or 1948 Senate campaigns; the 1942 Bureau of Internal Revenue
investigation. All are asserted at length in Robert Caro, *The Path to Power* and *Means of Ascent* —
influential, and exactly the material where Dallek (*Lone Star Rising*) and Woods (*LBJ: Architect of
American Ambition*) differ in emphasis. **CONTESTED AMONG HISTORIANS / UNVERIFIED BY US.**

**The important one, and it cuts against the premise.** GAO gives the 1965 expansion as a
**contractor recommendation approved by the Navy**; NAVFAC gives the 1961 selection as a **BUDOCKS
board decision from five competing bids**, taken in November–December 1961 — under Kennedy, when
Johnson was Vice President and **Brown & Root was not in the venture at all**. Neither primary
document mentions Johnson in connection with the award or the expansion.

> **We found no documentary evidence tying LBJ personally to the award or enlargement of the RMK-BRJ
> contract, and the primary record affirmatively points elsewhere. "LBJ gave Brown & Root the Vietnam
> contract" is a POPULAR CLAIM WE COULD NOT VERIFY and should not be asserted in any form.**

What *is* defensible and is quite enough: a politically connected Texas firm with a long, openly
acknowledged friendship with the President joined, on the incumbent contractor's recommendation, the
largest construction consortium of the war. That is documented. The conspiracy is not.

### 3.4 Oversight — the GAO audit

GAO B-159451 was transmitted 15 May 1967 to the President of the Senate and the Speaker of the House.
The headline finding, verbatim:

> "Our survey indicated that neither the Navy nor the contractor was adequately equipped to handle the
> massive expansion of the construction program in late 1965 and the first half of 1966; as a result,
> the cost of the program was increased to a considerable extent, although **there is no way to
> reliably measure the extra cost sustained**. During the period of the escalated mobilization,
> **normal management controls were virtually abandoned** and major problems were experienced."

**The $120 million, verbatim:**

> "at the time of our review, the contractor could not account for the whereabouts of approximately
> $120 million worth of materials which had been shipped to Viet Nam from the United States. These
> materials were accounted for in the contractor's books as being in transit; however, the
> contractor's representative having responsibility for material control acknowledged that much of it
> had in fact been physically received in Viet Nam."

> "materials and equipment were 'dumped' at contractor depot sites, unidentified, unsegregated, and
> unprotected from the elements or theft."

> "At the Cam Ranh Bay depot… there were virtually no stock control records for the enormous
> quantities of materials and supplies on hand… the depot managers had no record of the value of
> their inventories."

**The statutory problem — this is the real, citable version of the "it was illegal" charge:**

> "Since the fee is computed by applying a percentage to a base made up of estimated costs, to the
> extent that the base comprises actual costs, the method of arriving at the fee partakes of the
> nature of a cost-plus-a-percentage-of-cost contract." … "**Under 10 U.S.C. 2306(a), the
> cost-plus-a-percentage-of-cost system of contracting may not be used.**"

**Both DoD and the contractor pushed back on the record** — quote this, it is the era's register in
one paragraph:

> "The contractor reported to us that, overall, the report appeared to be a reasonable evaluation of
> the program and many of the problems involved, but he emphasized that the facts presented in the
> report did not justify any conclusion that the program was mismanaged. The Department of Defense,
> in its comments to us, also stressed that, in view of the conditions under which the program had to
> be carried out and the remarkable construction performance attained, it did not consider that the
> management of the program could be considered wasteful or inefficient."

**Do not use, POPULAR CLAIMS WE COULD NOT VERIFY:** Rumsfeld's alleged "illegal by statute" and
"President's Club" charges (the milder 1966 floor quote — "The potential for waste and profiteering
under such a contract is substantial" — is reported by NPR but I could not reach the Congressional
Record); and "Burn & Loot" as a GI nickname, for which no period source was found.

### 3.5 The lineage to KBR

**DOCUMENTED.** Halliburton purchased Brown & Root in **December 1962** — and the seller was **the
Brown Foundation, not the brothers personally** (TSHA; *TIME*, "Industry: Buying Out a Giant", 21 Dec
1962, https://time.com/archive/6873273/industry-buying-out-a-giant/, reporting negotiations for the
95% of stock held by the Foundation). **The purchase price is CONTESTED** — $32.6m, $36.8m and
$33.5m all circulate, no primary source confirms any. Cite the structure, not the number.

A nice detail: **Halliburton's own corporate history page does not mention Brown & Root, Dresser,
M.W. Kellogg or KBR at all** — its timeline jumps 1951 → 1984
(https://www.halliburton.com/en/about-us/history).

Naming chain, from SEC filings: Dresser merger completed 29 September 1998 (FY1998 10-K,
https://www.sec.gov/Archives/edgar/data/45012/0000045012-99-000005.txt), bringing in M.W. Kellogg;
the FY1999 10-K shows **two** units, "Kellogg Brown & Root and Brown & Root Services" — so the
government-services arm carrying LOGCAP was **still branded Brown & Root Services into 1999–2000**.
KBR, Inc. was incorporated in Delaware 21 March 2006; Halliburton completed the separation on
**5 April 2007** by exchange offer — technically a split-off, not a spin-off (KBR FY2007 10-K).

**LOGCAP — DOCUMENTED.** Established **16 December 1985** by Army Regulation 700-137 (GAO-04-854,
https://www.gao.gov/assets/a243426.html). LOGCAP I was **competitively** awarded to Brown & Root
Services on 3 August 1992 as a **cost-plus-award-fee** contract (GAO/NSIAD-97-63,
https://www.govinfo.gov/content/pkg/GAOREPORTS-NSIAD-97-63/html/GAOREPORTS-NSIAD-97-63.htm).
LOGCAP III (December 2001, KBR) was also cost-plus-award-fee.

**The contract-type through-line is real and is the strongest thing here: cost-plus-award-fee — the
mechanism the Navy adopted for RMK-BRJ in May 1966, which the NAVFAC history says was "the first time
the award fee concept was used in a construction contract" — is the same instrument used for LOGCAP I
in 1992 and LOGCAP III in 2001.** Documentable from GAO at both ends.

**But no official source draws RMK-BRJ → LOGCAP.** A firm negative finding from full-text search:
CRS RL33834 and the Commission on Wartime Contracting final report contain **zero** occurrences of
"Vietnam" or "RMK"; the Army CGSC monograph covering RMK-BRJ in depth contains **zero** occurrences
of "LOGCAP," "Halliburton" or "Kellogg." **The corporate through-line is documentable. The
institutional claim that LOGCAP descends from RMK-BRJ is journalistic. If the game wants that line,
it owns it as authorial argument, not as cited fact.**

### 3.6 The language of the contractor war

Taken verbatim from the documents. Bureaucratic, additive, almost entirely drained of violence.

- **Roads are "Lines of Communication" (LOCs).** NAVFAC explains itself: "MACV published a report in
  October, 1967… on the multifaceted problems of restoring **LOCs (acronym for roads, or Lines of
  Communication)**."
- **Work is "put in place."** "**Work in place**" (WIP) is the unit of account throughout — a monthly
  dollar rate. "the contractor was directed to mobilize to the capability of accomplishing $40
  million worth of work in place per month."
- **Facilities are grouped as "Functional Facility Category Groups"** — "such as cantonments, ports,
  and airfields."
- **Work is authorised by "construction directives" and started by a "Notice to Proceed" (NTP).**
- **The armed services are "our customers."** RADM Lalor: "we went out with a message to all of our
  **customers** in-country and said, in effect, '**The time has come to fish or cut bait.**'"
- And his line on issuing the program: "On June 1, I was able to tell John Kirkpatrick… **'Here it is!
  Build it!'**" — with the admission, "I confess that a lot of the designs were what we would call
  **20 percenters**."
- **Employment paperwork:** the "**Off-Continent Employment Agreement**," signed at San Bruno.
- **Facilities are "turned over for use."**

**The acronym set** (NAVFAC Appendix A) is itself a design document: ACTOV (Accelerated Turnover to
the Vietnamese) · CPFF / CPAF · WIP · NTP · LOE (Level of Effort) · **MER (Minimum Essential
Requirements)** · LOC · OICC/ROICC/AOICC/DOICC · DIRCON · BUDOCKS · TCN · CONUS · POE · PWRS
(Prepositioned War Reserve Stock) · ABFC (Advanced Base Functional Component) · AM-2 · PSP (Pierced
Steel Plank) · SATS (Short Airfield for Tactical Support) · RED HORSE (Rapid Engineer Deployable
Heavy Operational Repair Squadron, Engineering) · RF & PF (Regional and Provisional Forces, "Rough
Puffs") · and, the outlier, **SLAM — Seeking, Locating, Annihilating, Monitoring**.

In a glossary otherwise made of funding, scope and turnover, one entry says the quiet part. That
contrast, unremarked, is the *Stars and Stripes* register exactly.

Ambassador Ellsworth Bunker at the RMK-BRJ close-out ceremony, 3 July 1972:

> "This occasion, which marks the successful conclusion of a decade of achievement, is an especially
> gratifying and hopeful moment, for it reminds us that **construction in the cause of war has also
> brought construction in the cause of peace and progress.**"

And the contractor's general manager, John A. Kirkpatrick, closing the books:

> "The thing that is going to determine how soon we can get out of this business is how soon we can be
> **relieved of the responsibility of property**. Once we have been relieved of the responsibility of
> property, then we can start closing our books."

---

## 4. Measurement — how the war was counted

This section is the longest because it is the one with the most direct bearing on the codebase's own
doctrine, and because the primary record is unusually rich. Every quotation below was string-matched
against a downloaded source.

### 4.1 The body count

**The incentive structure — DOCUMENTED.** The sharpest statement comes from inside the Office of
Systems Analysis. Enthoven & Smith, *How Much Is Enough? Shaping the Defense Program 1961–1969*
(RAND reissue CB-403), pp. 295–296 —
https://www.rand.org/content/dam/rand/pubs/commercial_books/2010/RAND_CB403.pdf

> "The incentives for field commanders clearly lay in the direction of claiming a high body count.
> Padded claims kept everyone happy; **there were no penalties for overstating enemy losses, but an
> understatement could lead to sharp questions** as to why U.S. casualties were so high compared with
> the results achieved… in a representative case, battalions raised the figures coming from the
> companies, and brigades raised the figures coming in from the battalions. In addition, something
> had to be (and was) put in for all the artillery and air support, which the men on the ground could
> not check out, to give the supporting arms their share of the 'kill.'"

This is an asymmetric-penalty argument, not a fraud argument: the error ran one direction because
only one direction drew questions.

**The validation that validated nothing — DOCUMENTED.** Same source, p. 296:

> "In one such attempt, General Westmoreland's intelligence chief reported in mid-1967 that his search
> of 70 captured enemy documents confirmed the 1966 body count to within 1.8 percent… **A review of
> the same documents by the Systems Analysis office suggested that the enemy body count was overstated
> by at least 30 percent.**"

**The same 70 documents, two offices, +1.8% versus −30%.** The disagreement is not about data
availability; it is about method applied to identical inputs.

**The monotone descent — DOCUMENTED (authoritative secondary).** Thomas C. Thayer ran the Southeast
Asia Division of OASD(Systems Analysis) — he ran the shop that made the numbers. In *War Without
Fronts* (Westview, 1985; licensed reissue https://www.usni.org/press/books/war-without-fronts), ch.
10, he lists four successive checks against captured documents, giving **+4.5%, −20%, −30%, −50%**.
Every methodological improvement made the official number look worse. And then: **"The attempts to
analyse stopped at this point."**

Thayer's verdict: **"The problem was that quantification became a huge effort but analysis remained a
trivial one."**

**Contemporaneous admission, 1967 — DOCUMENTED.** OSD Systems Analysis, *Southeast Asia Analysis
Report*, "Estimates of VC/NVA Combat Deaths", reprinted in DTIC AD-A051613
(https://archive.org/details/DTIC_ADA051613), listing among the problems: "In cases where the body
count makes the battle result look unfavorable, the tendency and pressures to estimate and perhaps
exaggerate the body count are very strong."

**The after-action-report finding — DOCUMENTED.** OSD official history, Edward J. Drea, *McNamara,
Clifford, and the Burdens of Vietnam, 1965–1969*, pp. 509–510 —
https://www.govinfo.gov/content/pkg/GOVPUB-D-PURL-gpo58528/pdf/GOVPUB-D-PURL-gpo58528.pdf

> "In a study of 77 U.S. operations conducted from January through October 1966 Systems Analysis found
> that the mandatory after-action reports had sufficient data to permit classification of only **38
> percent** of claimed casualties (3,600 out of 9,458) as enemy losses…"

> "…the 'body count' eventually became synonymous with exaggeration, duplication, and inflation of
> enemy casualties, as well as a notorious shorthand accounting system that dehumanized Vietnamese
> losses."

And, for balance, McNamara's stated rationale, same volume: the metric was meant to determine "what we
should be doing in Vietnam to win the war while putting our troops at the least risk" — "some means of
deciding whether you were moving forward or not moving forward." That is an honest engineering motive
and should be quoted alongside the failure.

**NOT RESEARCHED TO STANDARD — do not assert on our work:** MACV's actual counting directives
(directive numbers, the formal definition of a countable enemy KIA); **the "mere gook rule"**, whose
provenance we did not establish at all; and Westmoreland's own statements about the metric.

### 4.2 The order-of-battle dispute — the strongest documented case

Primary source: Harold P. Ford, *CIA and the Vietnam Policymakers: Three Episodes 1962–1968*, CIA
Center for the Study of Intelligence —
https://www.cia.gov/resources/csi/static/CIA-and-the-Vietnam-Policymakers.pdf

**The cap — DOCUMENTED.** Gen. Creighton Abrams (Deputy COMUSMACV) to Gen. Earle Wheeler (CJCS),
**20 August 1967**:

> "overall enemy strength, the figure will total 420,000 to 431,000… This is in sharp contrast to the
> current overall strength figure of about 299,000 given to the press here… **We have been projecting
> an image of success over the recent months**… In our view the strength figures for the SD and SSD
> should be omitted entirely from the enemy strength figures in the forthcoming NIE."

George Carver to DCI Helms, 11 September 1967 (*FRUS 1964–68* V, Doc. 314,
https://history.state.gov/historicaldocuments/frus1964-68v05/d314):

> "General Westmoreland (with Komer's encouragement) has given instruction tantamount to direct order
> that VC strength total will not exceed 300,000 ceiling… any higher figure would not be sufficiently
> optimistic and would generate unacceptable level of criticism from the press…"

**Why MACV held the line — DOCUMENTED, and this is the most transferable finding in the dossier.**
Ford:

> "the MACV staff had been claiming for some time that the enemy was suffering great losses… and in
> mid-1967 predicted that a 'crossover' would soon occur when losses would exceed the replacement
> capacity; **an accounting correction in the O/B would muddy the arithmetic behind this claim**."

The body count and the order of battle were two ends of one equation. Correcting the denominator
would have destroyed the headline result derived from the numerator. **Two metrics that share an
identity cannot be corrected independently, so the corrupted one protects the other.**

**The negotiated estimate — DOCUMENTED, and it corrects the usual telling.** Carver, 13 September
1967: "Circle now squared, chiefly as result of Westmoreland session" (*FRUS* V, Doc. 325). On 14
September all parties agreed a total of 249,000 and "that no quantified estimate should be given for
'irregulars.'" SNIE 14.3-67 (13 November 1967) carried the negotiated number (*FRUS* V, Doc. 397,
https://history.state.gov/historicaldocuments/frus1964-68v05/d397).

> **SNIE 14.3-67 is not the honest internal document hidden behind a dishonest public one. It is the
> internal estimate that was negotiated down to match the public line.** The mechanism was not "know
> the truth internally, lie publicly" — it was **suppress the truth internally so the public claim
> becomes formally supportable.**

Helms knew: his covering memo to the President called the SNIE "sensitive and potentially
controversial," and he considered withholding it, publishing only because "the charge of bad faith or
unwillingness to face the facts would be more generally damaging."

**Contemporaneous dissent — DOCUMENTED.** Sam Adams on the draft: it "makes **canyons of gaps**, and
encourages self delusion." George Allen: "I had never been so angry in my life, and I toyed with the
idea of resigning from CIA." Carver, reported by Thomas Powers: "intelligence is not written for
history; it's written for an audience… If the White House absolutely insists on an enemy OB under
300,000, that is what it is going to get." Col. Daniel Graham, MACV J-2, later admitted to Allen that
"of course" he had not believed the 300,000 figure but defended it anyway.

**The arithmetic that broke it.** At the "Wise Men" briefing of 25 March 1968, after Gen. DePuy
claimed a crushing enemy defeat, Arthur Goldberg set the understated order of battle against the
claimed enemy killed and wounded and asked: **"Who, then, are we fighting?"**

**The CBS libel case — PARTIALLY DOCUMENTED, MOSTLY NOT RESEARCHED.** Ford confirms the 1984 trial
happened and reports testimony from it — George Allen there termed MACV's 1967 positions "a
prostitution of intelligence" and said CIA "had sacrificed its integrity on the altar of public
relations and political expediency," and former MACV J-2 officers Gen. McChristian and Col. Gaines
Hawkins testified. **Everything else about the case — filing date, damages sought, documentary title
and airdate, the CBS internal review, and the terms on which it ended — is UNVERIFIED. Do not use.**

### 4.3 The Hamlet Evaluation System

**Origin — DOCUMENTED.** CIA internal paper, *A History of the Hamlet Evaluation System*,
CIA-RDP80R01720R000200120001-2 (readable mirror:
https://archive.org/details/cia-readingroom-document-cia-rdp80r01720r000200120001-2):

> "On the 24th of October, 1966, Robert S. McNamara… requested that the CIA and other Washington
> groups devise a procedure and technique for evaluating progress in the pacification aspects of the
> war in South Vietnam… a task group under the leadership of Mr. George W. Allen… devised a
> quantitative technique…"

**Mechanics — DOCUMENTED.** MACV CORDS, *Hamlet Evaluation System Command Manual*, 1 September 1971
(NARA RG 472) — https://www.archives.gov/files/research/military/vietnam-war/rg-472-hes-command-manual.pdf

> "The system provides information in three functional areas… from a set of **165 multiple-choice
> questions**… Answers to these questions are submitted **monthly and quarterly by US District Senior
> Advisors (DSAs)**… where the data is processed. HES may be considered an approach to pacification
> measurement, since the system computes ratings for hamlets and villages using a mathematical
> technique (**Bayes Theorem**)… from A, the most secure, through E, the least; N (non-evaluated); or
> V (under Viet Cong control)."

Scale: about **12,000 hamlets per month**. The original 1967–69 instrument was six factors × three
indicators = **18 items**, with six "confidence" items — the adviser scored his own confidence after
every third indicator. Anders Sweetland, *Item Analysis of the HES*, RAND D-17634-ARPA/AGILE, 20
August 1968 — https://www.rand.org/pubs/documents/D17634.html — preserves **all 18 indicators with
their five graded statements verbatim in Appendix A**. It is the single best artefact for showing what
a district adviser actually filled in. Sample graded statement (indicator 2C, grade "d"): *"No overt
propaganda but terrorism or sabotage during past month. VC TAXATION PREDOMINANT."*

Sweetland's factor analysis found two factors accounting for ~95% of common variance. **Eighteen
questions were measuring about two things.**

**The aggregation defect — DOCUMENTED, and stated by the agency that built the system:**

> "The summary letter grades (**the arithmetic average of the eighteen criteria**) were grouped so as
> to form three categories: Secure (A, B, C); Contested (D, E); and VC… **First, HES did not
> specifically measure 'control'… Second, from a quantitative standpoint, the control categories
> tended to mask significant movements in pacification status. In fact, it was statistically possible
> for HES to measure a decline in pacification status that would appear as progress in the control
> categories.**"

> "It is precisely this type of anomaly that produced the contrast between **optimistic HES-based
> press releases and the real events leading up to the Tet (1968) offensive**."

**The bucketing destroyed the signal.** A continuous measure was averaged into a letter, the letters
bucketed into three bins, and the bin transition was non-monotone in the underlying quantity. The
headline could rise while the thing it named fell.

**The adviser-access problem — DOCUMENTED with numbers.** Ithiel de Sola Pool et al., *Hamlet
Evaluation System Study*, Simulmatics Corp. for the Army Concept Team in Vietnam, 1 May 1968,
AD 839821 — https://archive.org/details/DTIC_AD0839821

> "the availability of transportation and the advisor's perception of security in his district
> influence the degree to which he visits the hamlets… **when security is perceived to be high or
> medium, a higher percentage of hamlets are visited than when security is perceived to be low.**"

Share of hamlets personally visited: 80%+ — 41.0%; 60–79% — 25.6%; **0–59% — 33.7%.** About a third of
district senior advisers were scoring hamlets they mostly had not visited, and the least-visited were
the least secure. **The sampling bias ran the same direction as the reporting bias.** Where advisers
and the study's independent analysts disagreed, the skew was roughly 7:1 optimistic (HES high 25.0%,
agree 71.4%, HES low 3.6%).

⚠ Declare the interest: de Sola Pool was a principal in ARPA's Project AGILE and the report is
Army-commissioned and broadly favourable to HES. Insider evaluation, not audit.

**Tet 1968 — DOCUMENTED.** OSD Systems Analysis, "Post-Tet Pacification Regression," DTIC AD-A039316
(https://archive.org/details/DTIC_ADA039316):

> "The VC Tet offensive dropped **1.3 million people** from the relatively secure A-B-C hamlets —
> 969,000 to contested (D-E) and 283,000 to VC… The proportion of relatively secure SVN population
> fell from a high of **67% on January 31 to 60% on February 29**…"

And the CIA history records that the corrective analysis was unwelcome: a hamlet-weighted data series
developed to counter refugee-flight bias "was used in several **unpopular briefings** in late 1967 to
show that the GVN was losing ground despite the USMACV press releases to the contrary."

**CONTESTED.** Sweetland argues the Tet criticism is a category error: "The ultimate representation of
this animus and misunderstanding resulted from Tet: '**The HES is no damn good; it didn't predict
Tet.**' Just why a measure for determining the status of the Revolutionary Development program in the
hamlets should be criticized for not predicting a military attack on the cities did not occur to the
critics." He also notes "our search for a person who feels neutral about the HES has been fruitless."
**Present both.**

**HES/70 — a documented case of reweighting a metric to make it move.** The Command Manual documents
a reaggregation requested by DEPCORDS/MACV in October 1970, effective 1 January 1971, giving "equal
importance to the military and political situations" so HES would be more **sensitive** to enemy
terrorism. CIA's retrospective verdict is far less flattering:

> "his responses were processed via an **exceedingly complex analogue** in Saigon… While it is possible
> that the revised HES system achieved its intent of getting the advisor out of the rating business,
> **it is certain that it made the system both far more cumbersome as well as statistically
> inconsistent with the three years of data that had preceded it.**"

**The fix broke the time series.** Comparability with everything measured before it was destroyed.

**Do not cite on our work:** the frequently-quoted adviser line about downgrading hamlets, and a 1972
HES Review Committee memo on "sudden upgrading of long-term enemy strongholds." Both trace through a
secondary article to primaries we did not retrieve. **UNVERIFIED.** Also: **no GAO report on HES was
located and we cannot confirm one exists.**

### 4.4 Sorties, tonnage and truck kills

**The JASON summer study — DOCUMENTED.** Memorandum from McNamara to President Johnson, **14 October
1966**, *FRUS 1964–1968* IV, Doc. 268 —
https://history.state.gov/historicaldocuments/frus1964-68v04/d268

McNamara's own text: "Nor has the Rolling Thunder program of bombing the North either significantly
affected infiltration or cracked the morale of Hanoi." The IDA/JASON Summer Study Group:

> "**As of July 1966 the U.S. bombing of North Vietnam had had no measurable direct effect on Hanoi's
> ability to mount and support military operations in the South at the current level.**"

Over the same period attack sorties rose "from about 4,000 per month at the end of last year to 6,000
per month in the first quarter of this year and 12,000 per month at present." **Effort tripled while
the measured effect stayed at zero.** The December 1967 JASON successor reached the same finding
(*FRUS* V, Doc. 439).

Corroborating internal assessments, all DOCUMENTED via FRUS: CIA, November 1966 — "Rolling Thunder
program has not been able to prevent about a threefold increase in the level of personnel
infiltration in 1966" (*FRUS* IV, Doc. 292); CIA/DRR, 1 June 1966 — of targets struck "only a small
number were truly essential to the war effort" (*FRUS* IV, Doc. 157). And OSD Systems Analysis, in
Thayer Vol. 5 (DTIC AD-A051611): "**over the entire period of the bombing, the value of economic
resources gained through foreign aid has been greater than that lost because of the bombing.**"

**A sortie rate pursued with no effect measure — DOCUMENTED.** Thayer Vol. 5, on ARC LIGHT (B-52),
September 1967. OSD Systems Analysis: "In view of the $600 million annual cost of the ARC LIGHT
program the question should be asked, **is the program paying its way?**… **it appears impossible to
find valid quantifiable measures of the true effectiveness of this program.**" And: "There is no
statistical basis to justify an increase in the sortie rate to 1200 sorties per month."

The Air Staff rebuttal, printed alongside, **concedes the point and proceeds anyway**:

> "it is probably true that **no quantifiable objective means are now in being to measure total ARC
> LIGHT results** or to justify the requested increase to 1200 sorties. **There are certain
> considerations, however, that override pure statistical analyses.**"

Scale, same source: "over 13,000 sorties have dropped **301,000 tons of bombs**… Consumption the first
8 months of this year has averaged 20,000 tons per month, **equalling the monthly ordnance
expenditures by all types of aircraft during the peak year of the Korean War.**"

**The truck kills — DOCUMENTED, and the best artefact in the dossier.** Bernard C. Nalty, *The War
Against Trucks: Aerial Interdiction in Southern Laos, 1968–1972*, Air Force History and Museums
Program, 2005 — official USAF history —
https://media.defense.gov/2025/Jun/24/2003742618/-1/-1/0/WARAGAINSTTRUCKS.PDF

*The arithmetic did not close, so the number was adjusted:*

> "The planners of Commando Hunt VII added up the claims… and found that aerial interdiction received
> credit for **destroying 99,494 tons of supplies**, even as the enemy consumed another 53,304 tons…
> **The cargo believed to have entered southern Laos during these four aerial interdiction operations
> totaled only 135,360 tons**, however… **the numbers made no sense.**"

The resolution: Seventh Air Force staff officers **"reduced by more than a third"** the total weight of
supplies destroyed, to reach a number consistent with a reserve they had posited to explain the gap.

*The counting rule moved:* "the criteria for the earliest Commando Hunt operation stated that **an
immobilizing hit with even a 20-mm shell killed a truck**… **By November 1971… a vehicle had to
explode or catch fire to be counted as destroyed.**"

*The closed loop:* "Seventh Air Force headquarters claimed an aggregate of **forty-six thousand trucks
destroyed or damaged**… **Estimates of North Vietnamese truck imports tended to keep pace with the
claims of trucks killed and disabled.** After acquiring **fewer than six thousand trucks per year from
1968 through 1970**…"

**That middle sentence is the finding. The denominator was estimated in a way that tracked the
numerator — a closed loop in which no observation could falsify the claim.**

Leonard Sullivan, Deputy Director of Defense Research and Engineering for Southeast Asia Matters:
"'**Skepticism over the accuracy of the Air Force's claimed truck kills in Laos,**' he wrote, '**ranks
second only to disbelief of the Army's "body count" numbers**…'" His grounds were physical, not
statistical: the absence of "photographic evidence to support the vast wreckage that should have
accumulated on the Laotian landscape (at least ten carcasses per mile of road and trail)." *Where are
the wrecks?*

Nalty's structural verdict: "Analysts tended to measure effort, mainly sorties and bombs dropped…
**The jungle hid the exact results.**" The metric measured what the instrument could see, which was the
input.

**The Senate staff report — DOCUMENTED, retrieved and string-verified.** *Laos: April 1971*, staff
report by Lowenstein and Moose, Senate Foreign Relations Committee, 3 August 1971 —
https://www.govinfo.gov/content/pkg/CPRT-92SPRT65324/pdf/CPRT-92SPRT65324.pdf

> "**These figures are not taken seriously by most U.S. officials, even Air Force officers, who
> generally apply something on the order of a 30 percent discount factor. One reason why there is some
> skepticism about the truck kills claimed by the Air Force is that the total figure for the last year
> greatly exceeds the number of trucks believed by the Embassy to be in all of North Vietnam.**"

> "**Truck kill and damage figures are arrived at through a set of criteria developed by the Air Force.
> It is assumed, for example, that if a truck is hit by a 40mm shell it is destroyed and that if the
> shell hits within 10 feet of the truck it is damaged.** One Air Force officer told us that **if the
> truck kill figures proved, on further analysis, to be unrealistic, the criteria would then be
> changed.** Another commented that he assumed that the North Vietnamese were intelligent enough to
> **set off decoy explosions**…"

One page contains: a modelling assumption dressed as an observation; an explicit statement that the
*rule* would be revised to make the output plausible; an adversary gaming the sensor; users applying a
private undocumented 30% discount while continuing to report the number; and a physical-impossibility
check that was known and did not stop publication.

**UNVERIFIED — do not use:** the commonly repeated ~7–8 million tons total for Southeast Asia and
~643,000 tons for ROLLING THUNDER. **No citable primary source was found.** The Thayer ARC LIGHT
figure (301,000 tons, June 1965–Aug 1967) is verified; the war totals are not.

### 4.5 McNamara and systems analysis

**The institutional mechanism — DOCUMENTED.** OSD official history (Drea, Vol. VI): ASD(Comptroller)
Charles J. Hitch "had revolutionized DoD's financial management process through the introduction of
the **Planning, Programming, and Budgeting System (PPBS)**." The Systems Analysis office was formally
chartered 17 September 1965 under **Alain C. Enthoven**:

> "Providing the quantitative data that 'proved' the cost-effectiveness and strategic soundness of the
> secretary's plans and decisions, Systems Analysis, in the words of a McNamara aide, furnished the
> '**numbers to back up his [McNamara's] position**.'"

The RAND lineage is direct: Hitch founded RAND's Economics Division in 1948, co-wrote *The Economics
of Defense in the Nuclear Age* (1960), and hired his RAND colleague Enthoven. The PPBS annual cycle
ended in **Draft Presidential Memoranda prepared in Systems Analysis** — the analytic staff drafted
the document that became the decision. That is the mechanism by which quantification became
management.

McNamara's method as a failure mode, OSD Vol. VI p. 30:

> "His aggressive management style… and his proclivity to '**concentrate on what could be quantified**'
> immersed him in day-to-day details better left to others… Still, in his view, everything had a
> solution. '**If we can learn how to analyze this thing,**' he said of Vietnam, '**we'll solve it.**'
> To that end he marshaled a dazzling array of facts and figures that only tended to obscure the
> larger issues."

**Systems analysis on its own limits — DOCUMENTED.** Enthoven & Smith: "Doubtless a better term should
have been found. '**Systematic analysis**' or '**quantitative common sense**' would have been more
accurate" (p. 62). And, p. 270: "The Systems Analysis office **did not have a prominent, much less a
crucial, role in the Vietnam war**… **In Vietnam, no one insisted on systematic efforts to understand,
analyze, or interpret the war.**"

⚠ **Read that source with its interest declared.** *How Much Is Enough?* is the defence brief of the
office under indictment; its thesis is that systems analysis was *excluded*, not that it corrupted.
Cite it for the body-count incentive analysis — which is devastating and self-implicating — and flag
the framing.

**Where historians disagree — CONTESTED.** The fault line is not "metrics good / metrics bad" but
whether metrics explain anything at all. Gibson (*The Perfect War*, 1986) treats the war as a
production system with body count as output; Krepinevich (*The Army and Vietnam*, 1986) argues the
Army brought the wrong concept of war and the metrics followed. The revisionist position is Gregory
Daddis, *No Sure Victory: Measuring U.S. Army Effectiveness and Progress in the Vietnam War* (Oxford
UP, 2011):

> "While much of the Vietnam historiography maintains that 'body counts' served as the U.S. Army's only
> indicator of success in Vietnam, this argument is **too simplistic and unsupported by the vast number
> of reports generated by MACV**…"

> "MACV—and much of DoD—**went about measuring everything and, in a real sense, measured nothing. In
> the process of data collection, the data had become an end unto itself.**"

**A real convergence worth noting:** Daddis's diagnosis — collection displaced analysis — is verbatim
what Thayer, who produced the numbers, concluded in 1985. The leading revisionist and the man who ran
the shop agree about the mechanism while disagreeing about the blame.

### 4.6 "The McNamara fallacy" — the attribution does not hold up

Checked carefully, because the phrase is ubiquitous and the project's doctrine documents are exactly
where a misattribution would end up.

**REFUTED: McNamara never said it.** The belief traces to **Charles Handy, *The Empty Raincoat*
(Hutchinson, 1994), p. 218** (https://archive.org/details/emptyraincoatmak00hand), which attributes
the passage to McNamara himself **and misspells his name**: "He said, in what has come to be known as
the Macnamara Fallacy…"

**REFUTED: the usual citation.** The near-universal source given is Yankelovich, "Corporate
Priorities" (1972). The four-step passage does not appear to be in it; the citation is a merge
artefact.

**DOCUMENTED: the actual origin.** Daniel Yankelovich, "The New Odds," address to the Eleventh Annual
Marketing Strategy Conference of the Sales Executives Club of New York, **15 October 1971**:

> "Here is what happens when the McNamara discipline is applied too literally: The first step is to
> measure whatever can be easily measured. This is okay as far as it goes. The second step is to
> disregard that which can't be easily measured or give it an arbitrary quantitative value. This is
> artificial and misleading. The third step is to presume that what can't be measured easily really
> isn't very important. This is blindness. The fourth step is to say that what can't be easily
> measured really doesn't exist. This is suicide."

**And the next sentence settles the Ford-versus-Vietnam question in favour of Vietnam:**

> "Among the many bitter lessons that our experience in Vietnam **with its body counts and village
> pacification ratios** has driven home, is the conclusion that it is a short, fatal step from the
> statement, 'There are many intangibles and imponderables that we can't put on our computers,' to the
> statement, 'Let's measure what we can and forget about the intangibles.'"

Two independent legs support this. A **pre-internet print citation**: S. Prakash Sethi, "Corporate
Social Audit," in Votaw & Sethi, eds., *The Corporate Dilemma* (Prentice-Hall, 1973), p. 228, citing
"The New Odds," 15 October 1971 — with *Corporate Priorities* cited **separately** at p. 221, very
likely the exact point where later citations merged the two. And the **archival transcript**, located
in the Daniel Yankelovich Papers, MSS 0804, UC San Diego Special Collections
(https://oac.cdlib.org/findaid/ark:/13030/c8bz6cnm — collection confirmed by us, item-level entry not
confirmed), published with the family trust's permission at https://ryanmadden.net/i-found-the-mcnamara-quote/

Note the coinage is "the McNamara **discipline**… applied too literally," not the phrase "McNamara
fallacy."

**Related literature, with one citation caution.** **Campbell's law — DOCUMENTED**, Donald T.
Campbell, *Assessing the Impact of Planned Social Change*, Occasional Paper Series #8, December 1976,
p. 49: "**The more any quantitative social indicator is used for social decision-making, the more
subject it will be to corruption pressures and the more apt it will be to distort and corrupt the
social processes it is intended to monitor.**" On the next page Campbell names PPBS directly, so the
link to the McNamara-era management movement is his own, not a modern retrofit. **Goodhart's law —
wording DOCUMENTED, citation CONTESTED**: two different 1975 Goodhart papers in the same Reserve Bank
of Australia volume are cited for it and we could not resolve which. **Strathern's** famous
formulation ("when a measure becomes a target, it ceases to be a good measure") is universally
credited to her 1997 *European Review* article but **we could not confirm the sentence or the page —
UNVERIFIED.**

**A distinction the literature blurs, and this project should not.** Campbell and Goodhart describe
**corruption of an indicator under pressure** — the number bends because it is being used.
Yankelovich's steps 3 and 4 describe something different: **ontological demotion of the unmeasured** —
what cannot be measured is first deemed unimportant, then deemed not to exist. Vietnam exhibits both,
and they call for different countermeasures.

### 4.7 Internal report versus public statistic — the direct contradictions

**October 1963 — DOCUMENTED.** On 2 October 1963 the President announced that most US personnel could
be withdrawn by end-1965 and 1,000 by end-1963, on the strength of the McNamara–Taylor report of the
same date, which stated "The military campaign has made great progress and continues to progress"
(*FRUS 1961–63* IV, Doc. 167). Twenty days later, INR research memorandum **RFE-90, 22 October 1963**,
"Statistics on the War Effort in South Vietnam Show Unfavorable Trends" (*FRUS* IV, Doc. 205,
https://history.state.gov/historicaldocuments/frus1961-63v04/d205):

> "**Statistics on the insurgency in South Vietnam, although neither thoroughly trustworthy nor
> entirely satisfactory as criteria, indicate an unfavorable shift in the military balance.**… the
> military position of the government of Vietnam **may have been set back to the point it occupied six
> months to a year ago.**"

Note the built-in epistemics: State's own analysts caveat their statistics as unreliable in the same
breath as using them.

**1962–63, running the other way — DOCUMENTED, and this complicates the simple story.** Ford records
that O/NE's February 1963 draft NIE "voiced definite alarm," was rejected by DCI McCone, and was
softened after officials objected that it "did not sufficiently stress examples of progress." **In
1962–63 as in 1967, the internal estimate was made more optimistic under command pressure.** The
mechanism was not "know internally, lie publicly" but **steer the process that produces the internal
record**.

**NOT SUBSTANTIATED — do not use:** a ROLLING THUNDER internal-versus-public pairing (the internal half
is airtight but we have no primary-sourced, dated public statement by a named official asserting the
opposite); GAO or DoD IG reports finding Vietnam statistics unreliable (gao.gov blocked every
attempt — nothing found, nothing asserted).

### 4.8 What this is worth to the codebase

Six mechanisms, each attached to a verified primary source above, each with a direct analogue in
instrumented software. These are offered as engineering lessons, not as a moral.

1. **Asymmetric penalties make error one-directional.** No one was punished for overstating;
   understating drew questions. A metric with a one-sided review process is not a measurement.
2. **Coupled metrics cannot be corrected independently.** MACV could not fix the order of battle
   without destroying the crossover claim built on the body count. Before correcting an instrument,
   find out what else is derived from it.
3. **The consistency check can be contaminated by the thing it checks.** Truck-import estimates moved
   with truck-kill claims. A validation input that tracks the output validates nothing.
4. **When the number is implausible, the counting rule gets revised.** "If the truck kill figures
   proved… unrealistic, the criteria would then be changed." That is fitting the instrument to the
   desired reading.
5. **Bucketing can invert the signal.** HES could "measure a decline… that would appear as progress."
   Check the monotonicity of every aggregation.
6. **Everyone privately discounting a number while continuing to publish it is the terminal state.**
   A 30% discount applied by consensus and written down nowhere. The metric had stopped being
   information and become a reporting obligation.

---


---

## 5. The air war and the helicopter — practical grounding

This section is the one an engineer builds missions from. **Method note that affects every citation
in it:** `history.army.mil`, `apps.dtic.mil` and `media.defense.gov` all returned HTTP 403 from this
environment. The workaround was Internet Archive full-text mirrors of the *same* government
documents, string-matched locally. OCR artefacts are preserved and marked `[sic]`.

Core sources, cited by short name below:

| Short name | Document | URL read |
|---|---|---|
| **Tolson** | Lt. Gen. John J. Tolson, *Airmobility 1961–1971*, CMH Pub 90-4 | https://archive.org/download/CMHPub90-4/CMHPub90-4_djvu.txt |
| **Dorland & Nanney** | *Dust Off: Army Aeromedical Evacuation in Vietnam*, **CMH Pub 90-28** | https://archive.org/download/CMHPub90-28/CMHPub90-28_djvu.txt |
| **Neel** | Spurgeon Neel, *Medical Support of the U.S. Army in Vietnam 1965–1970*, CMH Pub 90-16 | https://archive.org/download/CMHPub90-16/CMHPub90-16_djvu.txt |
| **CHECO** (various) | Project CHECO reports, DTIC | e.g. https://archive.org/stream/DTIC_ADA486944/DTIC_ADA486944_djvu.txt |
| **Pleiku AAR** | HQ 1st Air Cav Div, *Lessons Learned 3-66: The Pleiku Campaign*, AD-0855112 | https://archive.org/download/DTIC_AD0855112/DTIC_AD0855112_djvu.txt |
| **VHPA/Roush** | Gary Roush, *Helicopter Losses During the Vietnam War*, VHPA | https://www.vhpa.org/heliloss.pdf |

Bibliographic correction: the Dorland/Nanney *Dust Off* volume is **CMH Pub 90-28**.

### 5.1 The exposure clock — the number to build the LZ mode around

**DOCUMENTED**, Tolson:

> "**From the moment the first helicopter touched down until the last ship lifted off, two minutes
> were considered average unloading time for a twelve-ship formation. This two minutes seems an
> eternity when one is expecting enemy fire any second.**"

> "**To lessen the possibility of fire being concentrated on a single ship, all helicopters attempted
> to depart at the same time.**"

**The LZ prep relay — LZ X-Ray, 14 November 1965.** The single best passage in the corpus for an air
assault mode, because it is a hand-off relay with named timings:

> "**Preparatory fire began at 1017 hours precisely where required and was timed with the lead
> elements of the assault company. The aerial artillery came on the heels of the tube artillery fire
> and worked over the area for 30 seconds expending half their load, then went into a orbit nearby to
> be on call. The lift battalion gunships took up the fire and were immediately ahead of the troop
> transport Hueys.**"

Sequence: **tube artillery → ARA (30 seconds, half load, then hold on call) → lift-battalion gunships
→ transports on the skids.**

**Formation and routing — DOCUMENTED**, Tolson: "**The formation most frequently used was the 'V'**…
Helicopters normally flew about 45 degrees to the side and rear of the lead ship and high enough to
be out of the rotor wash. Armed helicopters operated at the same altitude as the escorted force. **A
reconnaissance element of two or four armed helicopters preceded the transports by one to five
minutes**…" And: "**The helicopter companies always attempted to plan return routes that were
different from the approach routes.**" The touchdown goal: "**The critical approach phase was
initiated by all transport helicopters at the same time in an attempt to place all aircraft on the
ground simultaneously.**"

**ARA/air deconfliction — implementable directly.** Tolson on the Ia Drang: "**The aerial rocket
artillery and Tactical Air flew perpendicular to the artillery gun-target line in those cases when
they were making a simultaneous attack on the same target areas.**" ARA alert ladder: "**Two minutes
after a fire mission was received they were airborne**… As soon as the first section departed, a
second section moved from a five-minute alert to the two-minute alert status."

### 5.2 Altitudes, and the documented threat-band reason

**DOCUMENTED**, Tolson — the band is named explicitly:

> "The escorts generally flew at no more than 100 or 200 feet above the ground and were **well within
> the zone of maximum vulnerability from small arms**."

> "The ground-based threat was essentially hand-held small arms and automatic weapons fire… **The
> lack of heavy enemy air defense had much to do with the selection of flight altitudes. During this
> time frame, most flights were made at 1500 feet or higher to reduce the chances of being hit by
> ground fire.** Contour flying was rarely performed."

Phase structure: "an **enroute phase, that was generally flown at a relatively safe altitude**, the
**approach phase, where the heliborne force usually descended to nap-of-the-earth heights several
kilometers away from the landing zone**, and the **landing zone phase**." Confirmed in the Ia Drang
narrative: the sixteen Hueys flew "at **two thousand feet**. **Two kilometers out, they dropped to
tree top level.**"

**And the counter-rule — when to go low anyway** (Pleiku AAR): "there are times when the best chance
to successfully complete a mission is when **assault altitude (50 feet absolute or lower)** is used.
The situations which favor [it]: (a) When weather limits altitude to less than 2,000 feet absolute.
(b) Minimum restriction to friendly support fire is desired. (c) Maximum surprise is required."

Dustoff orbited "**near the landing zones at two or three thousand feet, out of effective small arms
range**." Gunship envelope (CHECO): "**Cobras were most effective if the firing passes began at 1,500
feet or above, with target engagement at between 500 and 1,500 feet. The UH-1B/C gunships operated
better at a lower level.**"

**Quantified value of escort** (Tolson, 1963 data): transports hit at .011 hits/flying hour unescorted
vs **.0074 escorted**.

### 5.3 The threat

**DOCUMENTED**, CHECO *USAF Tactics Against Air & Ground Defenses in SEA* (AD-A487052):

> "The most important antiaircraft weapons in South Vietnam were machine guns of **12.7 and 14.5-mm**…
> With **rates of fire of 600 rounds per minute per barrel** for short cycles and **effective ranges
> of 3,300 and 4,600 feet, respectively**, these weapons accounted for most of the combat losses…
> **the gun crews were tireless and proficient in protecting their positions by frequent movement,
> digging, and camouflage, so that positions were rarely seen unless the weapons fired.**"

23-mm and 37-mm: "sustained rates of fire of 200 rounds and 80 rounds per minute, respectively, and
effective slant ranges of 6,600 and 8,200 feet."

**Laos versus South Vietnam — the sharpest contrast**, Tolson on Lam Son 719: "Whereas in Vietnam and
Cambodia we had operated against **7.62-mm and limited 12.7-mm fire**… operations in Laos had been
regularly opposed by **23-mm, 37-mm and 57-mm weapons**, while the 12.7-mm guns were employed in
multiple mutual supporting positions."

**Gun siting against LZs — usable directly as threat placement:** "The **12.7-mm weapons were often
employed in triangular or rectangular formations in the vicinity of high ground approximately 1,000
meters from a potential landing zone**… his antiaircraft weapons were continually redeployed, usually
on a day-to-day basis."

**LZ ambush teams**, Tolson: "the North Vietnamese Army technique of employing **10- to 12-man combat
teams — on or near every piece of critical terrain**… These small teams… **attacked allied aircraft
and infantry on virtually every landing zone, pick up zone, and friendly troop position within the
range of their weapons.**"

**SA-7, 1972 — DOCUMENTED.** Range "**two to three nautical miles**", altitude "**10,000-12,000
feet**", against targets up to "**430 knots**" (CHECO Kontum AD-A487009). Confirmed dates in South
Vietnam: **12 May 1972** (AC-130 hit) and **14 May 1972** (USAF O-2 FAC shot down) (CHECO An Loc
AD-A486941). **The single first launch of the war is UNVERIFIED.** Effect on tactics: "**7000-9000
feet was estimated as safe for slow targets (helicopters and FACs) and 6000 feet for higher speed
aircraft**… **The Cobra helicopter gunships, as all other helicopters, were also restricted from the
known SA-7 areas.**"

### 5.4 Losses

**DOCUMENTED, with a sourcing caveat.** VHPA/Roush: "There were about 12,000 helicopters that served
in the Vietnam War… **We have records showing 5,607 helicopter losses**… **Total helicopter pilots
killed in the Vietnam War was 2,165. Total non-pilot crew members was 2,712.**" Army UH-1s flew
**10,693,902 hours**; the AH-1G **1,166,344 hours**. **This is a veterans'-association dataset, not a
government publication, and it says so.**

**The widely-quoted "5,086 destroyed; 2,382 combat / 2,704 operational" split is UNVERIFIED and was
found in no government source. Do not use the combat/non-combat split.**

**Official cross-check — loss per sortie, from CMH.** Tolson gives the defensible ratios:

> "out of **1,147 sorties one aircraft would be hit** by enemy fire, **one aircraft was shot down per
> 13,461 sorties**, and only **one aircraft was shot down and lost per 21,194 sorties**."

Lam Son 719, the worst case: "Our total helicopter losses during this operation were **107
aircraft**… Most of these losses were troop transport Hueys — and **more than half of these were lost
just as they approached landing zones.** This again points out in the strongest way that **the
helicopter is most vulnerable as it comes to a hover over an unsecured or partially secured area.**"

### 5.5 Dustoff — and the 9-line question, answered

**THE 9-LINE MEDEVAC REQUEST IS NOT VIETNAM-ERA.** This was a specific do-not-invent question and the
answer is firm, established by document comparison across four editions.

- **FM 8-35, *Transportation of the Sick and Wounded*, 19 Oct 1966** gives an **unnumbered eight-item
  content list**, not a transmission protocol: "(1) Location of the landing site, usually by map
  coordinates. (2) Weather conditions. (3) Color of panels, smoke, or lights…"
  (https://archive.org/download/FM8-35_201212/FM8-35_201212_djvu.txt)
- **FM 8-10, 10 Apr 1970** reproduces **STANAG 2087** as then in force — also prose, also unnumbered.
  So STANAG 2087 existed in the era but **did not contain the nine numbered lines**.
- Grep confirmation: `nine-line`, `9-line`, `line 1.` return **zero hits** in FM 8-35 (1966) and
  nowhere in ~830 KB of Dorland & Nanney plus Neel.
- **First appearance found: FM 8-10-4, *Medical Platoon Leaders' Handbook*, 16 Nov 1990**, App. F
  Table F-1 — the fully-formed nine numbered lines with brevity codes. Its procedure (DRYAD cipher,
  **ANCD AN/CYZ-10 for SINCGARS**) is unmistakably late-1980s.

**Defensible statement: the numbered nine-line MEDEVAC request is a 1980s standardisation codified no
later than FM 8-10-4 (Nov 1990); it did not exist in Vietnam.** The exact year between 1970 and 1990
is UNVERIFIED.

**What the Vietnam call actually was — DOCUMENTED**, Dorland & Nanney:

> "the request had to contain much information: **coordinates of the pickup site, the number and types
> (litter or ambulatory) of patients, the nature and seriousness of the wounds or illness, the
> tactical radio frequency and call sign of the unit with the patients**, any need for special
> equipment… **The first four elements were critical: with them a mission could be flown; without
> them no air ambulance could guarantee a response.**"

**Design rule:** ground unit passes *grid — patients by type — nature of wounds — their freq and
callsign*, conversationally over FM. Precedence in Vietnam was **three tiers, not five**: "**urgent,
priority, and routine**", priority defined as "evacuated within four hours or else his condition will
deteriorate."

**The callsign origin — this kills the common myth. DOCUMENTED**, Dorland & Nanney credits **Maj.
Lloyd Spencer, mid-1963**, picking from an SOI list of unused call words: "one entry, 'Dust Off,'
epitomized the 57th's medical evacuation missions. Since the countryside then was dry and dusty,
helicopter pickups in the fields often blew dust, dirt, blankets, and shelter halves all over the men
on the ground." It was **not Kelly's**, and **not universal** — 1st Cav used **"Medevac"**, the 101st
**"Eagle Dust Off"**.

**Maj. Charles Kelly, 1 July 1964** near Vinh Long, told to leave the area: "He answered, **'When I
have your wounded.'** Many rounds hit his aircraft before one of them passed through the open side
door and pierced his heart." **DOCUMENTED**, exact wording those four words.

**The doctrinal gap that killed crews — model this:**

> "Army doctrine limited the ground unit's responsibility in reporting on a pickup zone: **if the
> unit's soldiers could safely stand up to load the casualties, the pickup zone could be reported as
> secure**. So the air ambulance crew could never be sure that the airspace more than ten feet above
> the ground would be safe."

**The best single design note in the corpus** — a 1st Cav officer, December 1966:

> "we've been shot up pretty badly twice during Operation Thayer while in position for hoist
> extraction… On both occasions the VC haven't fired a shot in the last ten to thirty minutes. Then,
> **just as the hook enters the pickup site, he cuts loose**. He is so close to our troops on the
> ground… **the armed escort ships can't fire for fear of hitting our own troops.**"

That is a scripted ambush trigger with gunship escort masked by friendly proximity.

**Hit rates — directly usable as damage-model constants:**

> "**one out of every ten enemy hits on the air ambulances occurred on** [hoist] **occasions**.
> Standard missions averaged an enemy hit only **once every 3[1]1 trips**, but hoist missions averaged
> an enemy hit **once every 44 trips**, making them **seven times as dangerous**… some **8,000
> aeromedical hoist missions** were flown during the war."

Hoist frequency: "the ambulance units used the hoist only once every sixty missions."

**Statistics — ship the ranges, not the round numbers.** Total moved: "**between 850,000 and
900,000**" 1962–1973. Peak year 1969: "**206,229**" patients, "**104,112 aeromedical evacuation
missions** while flying approximately **78,652 combat hours**"; "a single mission on the average moved
only two patients."

**Time — the two famous numbers are different measurements and are routinely conflated.** Neel:
"**Medical evacuation flights averaged only about 35 minutes each**" — that is the *flight leg*. Same
paragraph: "**The more seriously wounded usually reached a hospital within 1 to 2 hours after they
were injured.**" Independent Marine data (ONR AD-869148, n=4,392): "**mean mission time… one hour
forty-nine minutes from onset of injury to delivery**… the **median mission required 64 minutes**".
**So "wounded to hospital in under an hour" is right as a median, wrong as a mean.**

**Danger — the 3.3× figure is real and routinely misquoted:**

> "the high rate of air ambulance loss to hostile fire: **3.3 times that of all other forms of
> helicopter missions in the Vietnam War**. Even compared to the loss rate for nonmedical helicopters
> on combat missions it was **1.5 times as high**."

It is an **airframe loss-to-hostile-fire ratio**, not a crew-casualty ratio, and the apples-to-apples
comparison is **1.5×**. Quote both or overstate it.

**And the finding that should shape the threat budget:** of ~1,400 air ambulance pilots, "**about
forty aviators… were killed by hostile fire**… **forty-eight were killed and about two hundred injured
as a result of nonhostile crashes**… **slightly more than a third of the aviators became casualties.**"
**More Dustoff pilots died in non-hostile crashes than to enemy fire** — night, weather, terrain. A
medevac mode that models only bullets models the smaller half of the danger.

**Crew and aircraft detail — DOCUMENTED.** Four radios: "**FM, UHF, VHF, and single sideband (high
frequency)**." The aircraft commander "usually sat in the **left front seat**, leaving the right seat
to the pilot, who needed a view of the hoist." "**During a hover on a hoist mission he and the pilot
alternated on the controls every five minutes.**" Armament: "the air ambulances carried no armament
heavier than the pilots' M16 rifles." Scramble: "**Many could get off in less than three minutes.**"
Ground time (Neel): "usually between **15 seconds and 1 minute**." Hoist: "could lift up to **600
pounds**… and could lower a harness or litter **about 250 feet** below the aircraft." Forest
penetrator: Kaman, "**twenty pounds**", "**three small, paddle-like seats**".

### 5.6 FAC and close air support — authentic phraseology, graded by evidence

**The 9-line CAS brief is likewise NOT Vietnam-era.** Grep of 20+ CHECO reports 1965–73, FM 100-26
(1970), Tolson, *Seven Firefights* and three USMC official volumes for `nine.line|9.line` returned
**zero hits in any Vietnam-era document**. It is a **J-FIRE artefact**: Lester, *Mosquitoes to Wolves*
(Air University Press, 1997) records "**Tactical Air Command Pamphlet 50-28, J-Fire, July 1989**"
which "outlines… **a format for briefing CAS pilots**."

**What the Vietnam FAC brief actually was — an unnumbered checklist** (CHECO *FAC Operations in Close
Air Support Role in SVN*, AD-A486944): "Target — Elevation, Coordinates, Type, Surrounding terrain and
foliage • Weather • Expected ground fire • Location of Friendlies — Smoke identification, Distance
from target • Strike Headings — Planned to avoid flying into or over friendly troops • **A specific
statement to flight leader 'Do not drop without FAC clearance'** • Recovery procedures…" Content
overlaps the modern 9-line heavily; **format does not**.

**Phraseology, Grade A — attested verbatim in Vietnam-era USAF documents:**

- **"cleared in"**, **"went through dry"**, **"cleared to fire"** — "Litter 01 was **cleared in** on
  his run and **went through dry**. Litter 02 was **cleared in** on his run and then **cleared to
  fire**."
- **"hold high and dry"** — "Cider 17… **directed the fighters to hold high and dry**."
- Corrections **in metres**: "giving corrections in meters as **long, short, right, or left**."
- Mark-relative offset: "**place their napalm 15 meters to the east of his mark**".
- Smoke read-back discipline: "**The F-5 flight leader repeated the colors of the friendly smoke,
  identified the FAC's white phosphorous (WP) marker**". Documented colours are plain — green, purple,
  violet, yellow, red.
- **The ambiguous "Roger" as a documented fratricide cause:** "Cavalier 14 replied… '**Roger,
  standby**,' … although Rash 32 indicated he heard, '**Roger that.**' … It appeared that **Rash 32
  took Cavalier's 'Roger' as clearance** for the run."
- And a terminology mismatch that killed people: "The forward air controller said that he used the
  term '**southern edge of the napalm**', while Litter 01 stated that he heard '**up the ridge**'."

**Best verbatim talk-on in the corpus** — Butterfly FACs in Laos had no marking rockets, so they
talked fighters on cold (CHECO AD-A586312):

> "'**Okay, do you see the mountain?**', and he says '**yes**,' and then '**Now do you see the river on
> the right hand or the east side of it?**'… '**Okay, now if you took up that valley for 400 meters
> you will see a large rock.**' '**Yes, I have that.**' '**Okay, now I want you to hit 400 meters the
> other side of that rock.**'… '**Okay, number three, I want to go 200 meters further north.**'"

**Grade A, Army side — gunship-to-ground R/T**, from *Seven Firefights in Vietnam* (CMH, AD-A511302),
5 May 1968, transcript-derived. **This is the exact register for the Cobra mode:**

> "**I've got you in sight. We've been receiving heavy fire all morning and this afternoon. Hold on
> station at your orbit while I double-check our artillery check fire. Over.**" — "**Roger, dodger.
> Standing by.**"
> "**It's at co-ordinates XRAY SIERRA SEVEN NINER ZERO, EIGHT NINER NINER. OVER.**" — "**Say again
> those co-ordinates. Over.**"
> "**Negative! Negative on that! To the west of the road you'll see a pagoda about 200 meters from it.
> Including the pagoda and north of the pagoda, all those low buildings belong to you. Suggest you
> approach from the east. Over.**"
> "**Roger. Understand the pagoda and north of it belongs to me, but negative on an east approach.** We
> got a lot of ground fire over there when we did that this morning. We'll be approaching from the
> west. Over."
> "**No sweat. We'll start our run at this time. Out.**" — "**Roger-roger. We'll just march it a little
> shorter — about 200 meters short of the pagoda on up into it.**" — "**Your pattern is good. Keep it
> up.**"
> "**We're on fire, sir.**"

Register notes: strict "Over"/"Out"; "That's affirm"; "Negative! Negative on that!"; "Say again";
"belongs to you"; "march it"; no clock code, no brevity words beyond these.

**Phraseology, Grade D — UNVERIFIED, do not ship as period-authentic.** Absent from every CHECO
report searched, FM 100-26 (1970), Tolson, *Seven Firefights* and three USMC official volumes:

- **"Hit my smoke"** — not found. Use the documented equivalents above.
- **"Cleared hot"** — **not found in any 1961–73 document.** It appears only in post-1989 joint
  doctrine. It may well have been spoken; there is no period source. If used for player legibility,
  know it is an imported 1980s term.
- **"in hot" / "FAC in" / "off dry" / "off wet"** — not found in period sources.
- **"Willie Pete"** — not found; **"WP"** and "white phosphorous" are the documented forms. (Note: the
  original research brief for this dossier itself used "Willie Pete" — a good illustration of how the
  clichés propagate.)
- **"goofy grape" / "lemon yellow"** — the smoke-colour read-back *procedure* is documented; those
  colour names are not. Folklore.

**Response times — DOCUMENTED, and they vary by method.** III DASC rule of thumb: "**diverts averaged
20 minutes to time over target and scrambles averaged 40 minutes**." 7AF 1968 yearly average: "**52
minutes for diverts and 55 minutes for scrambles**." Armed-FAC (OV-10, Misty Bronco): "**78 of 98
requests for CAS by themselves in an average response time of seven minutes**" — of which "**3.7
minutes was accountable as delay while waiting ground clearance to fire**."

**That last figure is the best gameplay insight in the CAS material: most of a FAC's response time was
waiting for ground clearance, not flying.**

**"Silence is consent" — DOCUMENTED**, FM 100-26 (1970) ¶2-6b: "**Acknowledgment of the request by
intermediate tactical air control parties indicates approval by the associated headquarters unless,
within a specified period, a disapproval is transmitted.**" III Corps practice: "**disapproval within
five minutes or tacit approval was implicit.**"

**Shared clearance authority — a good fail-safe mechanic:** "**Although the FAC was responsible for
approving or disapproving the strike, it did not relieve the fighter pilot from the responsibility of
terminating the strike, if he saw a potentially dangerous situation developing.**"

**Callsigns — DOCUMENTED**: **Nail** (23d TASS, Nakhon Phanom), **Covey** (20th TASS, Da Nang),
**Raven** (Udorn); "**The Nails and Coveys flew 0-2s after 1967; the Ravens continued to fly O-ls.**"
**Rustic** = Cambodia, "**with French-speaking American or Cambodian backseaters**". **Misty** = F-100F
fast FAC, Phu Cat, from 28 June 1967. **Butterfly** = pre-Raven Laos FACs in Air America aircraft,
legally forbidden marking rockets.

Misty's hard tactical rules translate straight into sim constraints: "**did not spend prolonged
periods of time below 4,500 feet nor let his airspeed drop below 400 knots**"; "**did not make VR runs
where the ceiling was below 7,000 feet**"; "**did not control strikes where the ceiling was below
10,000 feet.**"

### 5.7 The machines

**AH-1G — arrival date.** CMH says **1 September 1967**, not the commonly quoted 29–30 August: "**On 1
September 1967, the first Huey Cobra (AH-1G) arrived in Vietnam. The initial six aircraft were
assigned to their New Equipment Training Team**… This team used the first six Cobras to check out the
pilots of the **334th Assault Helicopter Company**." Treat "Bien Hoa, 29 Aug 1967" as **UNVERIFIED**.

**Airframe** (TM 55-1520-221-10, Apr 1967, https://archive.org/download/ah1gtm/AH-1G%20TM_djvu.txt;
USAASTA flight test AD0874210): Lycoming **T53-L-13**, 1400 shp uninstalled, "**torque-limited by the
pilot to 1100 hp**". Main rotor 2 blades, **44 ft** dia, 27 in chord, 1520.5 ft² disc, solidity
0.0651. **Fuselage width 36 in.** Design/max gross **6,600 / 9,500 lb**. V_L **190 KCAS** below 4,000
ft DA, −8 KCAS/1000 ft; **180 KCAS** with XM159 pods. Rotor 294–324 rpm normal.

**Critical for the flight model: 190 kt is a structural limit, not achievable level flight.** AD0874210
at 8,500 lb / 5,000 ft / std day:

| Config | V_max level (KTAS) | 99%-max-NAMPP cruise (KTAS) |
|---|---|---|
| Clean (turret only) | 148.5 | 137.0 |
| Basic (1× XM157/wing) | 146.5 | 135.5 |
| Light hog (2× XM157/wing) | 142.5 | 131.0 |
| **Heavy hog (2× XM159/wing = 76 rkt)** | **135.5** | **127.0** |

"At 5000 feet, the V_H decreased from **154 KTAS at a 7000-pound grwt to 142 KTAS at a 9500-pound
grwt** in the clean configuration." Clean→heavy-hog costs ~9% on V_H; equivalent flat-plate area
**+7.7 ft²**. Climb: clean 7,500 lb — 2,200 fpm SL, service ceiling 20,900 ft; **heavy hog 9,500 lb —
1,250 fpm, service ceiling 14,200 ft**. Contract guarantees: **radius 148 NM, loiter 3.0 hr**.

**Turrets — two different ones, model them separately.** *TAT-102A* (early, one M134): azimuth
**±115°**, elevation **+15°/+25°**, **depression 50°**, **8,000 rounds**. *XM28 hybrid (M134 +
XM129)* has **narrower limits**: "**Maximum turret positions are 107.5-degrees left and right
azimuths, 50-degrees depression and 12-degrees to 17.5-degrees elevation.**" And: "**Rates of fire of
the 7.62 millimeter automatic gun are 1300 and 4000 rounds per minute… Continuous fire is limited to 6
second bursts by an automatic burst limiter… The 40 millimeter grenade launcher has a rate of fire of
400 rounds per minute and is automatically limited to 10 second bursts… A full complement of
ammunition consists of 4000 rounds of 7.62 millimeter and 300 rounds of 40 millimeter.**"

**Gunner's-station behaviour worth implementing** (TM ¶6-39): "**If the action switch is depressed and
the sight rotated at a speed greater than the turret maximum angular velocity, the firing circuit is
interrupted and the sight reticle blinks until the gun line is coincident within eight degrees to the
line of sight.**" Releasing the action switch auto-stows. Range knob calibrated **in metres**.

**Wing stores** (TM ¶6-69/6-70/6-82): "**The wing stores will provide for a maximum of four 19 tube
pods — 76 rockets.**" XM-157: 7 rockets, 51.5 lb empty / 202.5 lb loaded. XM-159: 19 rockets, 102 lb /
512 lb. Rule: "**When both the XM-157 and XM-159 launchers are installed the XM-159 launchers shall be
on the inboard hard points.**" XM-18 gun pod: inboard only, **1,500 rounds at 4,000 rpm**, "**These
fixed guns are aimed by flying the helicopter directly at the target.**" **M35 20 mm** (AD0865018):
XM195 six-barrel on the left inboard station, "**cyclic rate of fire is 650 to 850 shots per
minute… ammunition capacity is approximately 1000 rounds. With the armament system installed, the
lateral center of gravity is approximately 2 inches left of center.**"

**"M28 gun pod" appears to be a conflation of the M18 pod and the M28 turret — UNVERIFIED.**

**UH-1 variants** (Tolson's CMH appendix):

| | UH-1B | UH-1C | UH-1D | UH-1H |
|---|---|---|---|---|
| First delivery | 1961 | 1965 | 1963 | as D, more powerful engine |
| Rotor diameter | 44 ft | 44 ft | **48 ft 3 in** | as D |
| Crew / passengers | 2–4 / 8 | 2–4 / 6 | 2–4 / **11** | as D |
| Cruise / max | 90 k / 120 k | 100 k / **140 k** | 100 k / 120 k | as D |
| In inventory | 456 | 290 | 1,010 | 2,399 |

The **44 ft vs 48 ft rotor split is the single biggest flight-model difference in the family.**
Engines: UH-1B/D = **T53-L-11 (1,100 shp)**; UH-1C/H = **T53-L-13**, 1,400 shp "**derated to 1,100 shp
due to the maximum torque limit of the helicopter's main transmission**."

**Why the 540 rotor mattered — the strongest finding in this subsection.** The problem, Tolson: "**the
weight of the armament system reduced the maneuverability of the aircraft and induced sufficient drag
to lower the maximum speed to approximately 80 knots. As a consequence, the armed helicopters could
not overtake the airmobile force if they left the formation to attack targets enroute.**" The fix
(AD0811782): "**At any altitude or gross weight on a standard day, the UH-1B/540 could be operated at
maximum continuous power and not exceed the helicopter's never-exceed airspeed… The standard UH-1B was
limited by V_ne throughout its gross weight and altitude envelope… In general, the increase in level
flight speed of the UH-1B/540 was 15 to 35 KTAS.**"

**In a sim that is a hard V_ne clamp for the B and a power-curve limit for the C.**

**Scouts. OH-6A** (AD0855043): Allison T63-A-5A "**derated to a five-minute takeoff power of 252.5
shaft horsepower**"; **4 blades, 26.33 ft dia, 544.63 ft² disc**; empty **1,144 lb**; SL R/C **1,900
fpm**. **OH-58A** (AD0875793): T63-A-700, 317 shp; **2 blades, 35 ft 4 in**; V_NE achieved **123
KCAS**; OGE hover ceiling at 95 °F **2,240 ft**. **Why scouts preferred the OH-6A — the preference
claim itself is UNVERIFIED**, but the engineering case is sourced: disc **544.6 ft² vs ~980 ft²**
(decisive in a hole in the canopy), empty **1,144 vs 1,583 lb**, comparable climb on less power.

**Pink / White / Red / Blue teams — DOCUMENTED, and note the ratio is 1+1, not the 2+2 often quoted.**
Tolson on 1/9 Cav in Cambodia: "Using '**Pink Teams**'— **one Cobra gunship and one OH-6A observation
helicopter**— the Air Cavalry troops were able to cover large areas effectively."

| Colour | Element | Aircraft (as documented) |
|---|---|---|
| White | Aeroscout | OH-13 early, OH-6A from 1968; two per team |
| Red | Aeroweapons | two UH-1B gunships (1968), later AH-1G |
| Blue | Aerorifle platoon | inserted by UH-1D/H |
| Pink | White + Red hunter-killer | **one AH-1G + one OH-6A** (CMH, 1970) |

**Pink Team element altitudes: UNVERIFIED.** The commonly repeated "scout 10–50 ft at 45–60 kt, gun at
1,500 ft" traces to hobbyist sites only.

### 5.8 Terrain, weather and density altitude

**Terrain** (CHECO *Impact of Geography on Air Operations in SEA*, AD-A486707): Annamite chain "**peaks
range from 5,000 to 8,500 feet**"; Central Highlands "**some 20,000 square miles**", southern sector
"**averaging more than 3,000 feet**". Canopy: "**The average tree height in primary tropical rain
forests in Indochina is 80 to 100 feet, although occasional trees may reach 130 or 150 feet**…
multi-canopied… smaller trees which reach a height of **50 to 65 feet**." Mekong Delta: "**a monotonous
plain with few parts more than ten feet above sea level**."

**LZ X-Ray micro-terrain**, two independent government accounts agreeing: "**The terrain was flat with
scrub trees up to 100 feet high, thick elephant grass varying in height from one to five feet, and
ant hills up to eight feet high.**" Capacity: "**landing zone X-ray could take eight to ten UH-1D's at
one time.**"

Delta/jungle LZ conditions, Tolson: "In the Delta, water was sometimes chest deep and the ship had to
be held with the skids just under the water level or had to maintain a low hover. In jungle areas,
grass ten to twelve feet high was often encountered."

**Weather — the crachin, quantified:** "**The annual average crachin is 53 days at Hue, 41 days at Da
Nang, and only 10 days at Nha Trang.**" And: "clouds… are **3,000 to 5,000 feet thick, with ceilings
under 1,000 feet, 40 to 50 percent of the time, and frequently below 500 feet**… **Visibility is
usually less than two miles and is frequently less than one-half mile.**"

**The operational definition of "good weather" — DOCUMENTED**, Tolson, Operation Pegasus: "'**Good
weather' was considered to be any condition when the ceiling was above 500 feet and slant range
visibility was more than a mile and a half.**"

Hue, Tet 1968: "ceilings being at most **150 to 200 feet**… **Most of our helicopter operations were at
an altitude of about 25 feet.**" And the doctrinal lesson from A Shau: "**An inch of rain that falls in
thirty minutes is not nearly as important as a tenth of an inch which falls as a light mist over 24
hours.**"

**Density altitude — the primary-source number, and it corrects a common figure.** Pleiku AAR, p. 224:

> "(7) Density altitudes in excess of 3,000 feet reduce cons­iderably the maximum allowable loads. For
> example, a CH-47 departing AN KHE (1,500 feet) to QUI NHON (sea level) can safely transport 9,000
> pounds. The same aircraft departing AN KHE to PLEIKU (2,500 feet) can safely transport only 7,000
> pounds… This became a particular problem when **UH-1D loads were recomputed, reducing the infantry
> loads fro[m] seven to five combat troops**."

**The official figure is five troops per UH-1D in the highlands, not the six that circulates** (the six
comes from Moore & Galloway's commercial book). Corroborating: Company B assaulted X-Ray with
"**sixteen Hueys — four platoons of four each**" — ~80 men per lift, which is why the battalion closed
over hours, not one lift.

Dustoff's density-altitude cliff is sharper still: on a 95 °F western-Highlands day, OGE max load was
"**184 pounds for the UH-1D with an L-11 engine**… and **1,063 pounds for the UH-1H with an L-13
engine**. This meant that on such a day **the UH-1D could not perform a hoist mission**."

### 5.9 Two design notes worth pulling out

**The helicopter's danger is concentrated in the hover.** Four independent sources converge: Tolson's
"more than half of these were lost just as they approached landing zones"; the Dustoff hoist mission
being "seven times as dangerous"; the NVA's LZ-ambush teams; and 12.7 mm rings sited 1,000 m from
likely LZs. **A game that models the transit and not the last 200 metres models the wrong thing.**

**The environment should carry much of the threat budget.** More Dustoff pilots died in non-hostile
crashes than to enemy fire. Night, weather, terrain and density altitude are the documented killers
alongside the guns.
## 6. Covert action, deniability and the front company

This section covers the "CIA in the '80s" texture, and the material reaches back into the Vietnam era
— the deniable airline is a Southeast Asia invention.

Primary corpora, downloaded and string-searched: Church Committee Book I
(https://archive.org/stream/finalreportofsel01unit/finalreportofsel01unit_djvu.txt); the Church
assassination report (https://archive.org/stream/allegedassassina00unit/allegedassassina00unit_djvu.txt);
the Iran-Contra congressional report
(https://archive.org/stream/reportofcongress87unit/reportofcongress87unit_djvu.txt). OCR artefacts are
preserved in quotations rather than silently corrected.

### 6.1 The legal machinery

**Hughes-Ryan (1974) — DOCUMENTED, verbatim from Statutes at Large.** Public Law 93-559 §32, 88 Stat.
1804-05 — https://www.govinfo.gov/content/pkg/STATUTE-88/pdf/STATUTE-88-Pg1795.pdf

> "No funds appropriated under the authority of this or any other Act may be expended by or on behalf
> of the Central Intelligence Agency for operations in foreign countries, **other than activities
> intended solely for obtaining necessary intelligence**, unless and until the President finds that
> each such operation is important to the national security of the United States…"

Two register notes. The statute never says "covert action" — it defines the category **negatively**, as
everything that is not intelligence collection. And "**finds**" is the operative verb; the noun
"Finding" is a back-formation from this sentence. For a game set in the 1980s, **Hughes-Ryan is the
live law**; the modern §503 regime is the post-scandal replacement.

**Executive Order 12333 (4 December 1981) — DOCUMENTED.**
https://www.archives.gov/federal-register/codification/executive-order/12333.html

§3.4(h): "**Special activities** means activities conducted in support of national foreign policy
objectives abroad which are planned and executed so that the role of the United States Government is
not apparent or acknowledged publicly…"

§2.7, "Contracting" — the most on-theme sentence in the order:

> "Agencies within the Intelligence Community are authorized to enter into contracts or arrangements
> for the provision of goods or services with private companies or institutions in the United States
> and **need not reveal the sponsorship of such contracts or arrangements** for authorized intelligence
> purposes."

**"Plausible denial" is NOT statutory — DOCUMENTED as a doctrine named and criticised by
investigators.** Church Book I says so explicitly, and names the euphemism that carries it into legal
text:

> "President Ford's Executive Order included the concept of 'plausible denial.' **Using the euphemism
> 'special activities' to describe covert operations**, the Order stated: 'Special activities in
> support of national foreign policy objectives [are those] activities … planned and executed so that
> the role of the United States Government is not apparent or publicly acknowledged.'"

The fullest treatment is the Church assassination report, *Alleged Assassination Plots Involving
Foreign Leaders* (S. Rep. 94-465, 20 Nov 1975), §II.B:

> "Evidence before the Committee clearly demonstrates that this concept, designed to protect the United
> States and its operatives from the consequences of disclosures, **has been expanded to mask decisions
> of the President and his senior staff members**. A further consequence… is that subordinates, in an
> effort to permit their superiors to 'plausibly deny' operations, fail to fully inform them…"

> "'Plausible denial' can also lead to the use of **euphemism and circumlocution**, which are designed
> to allow the President and other senior officials to deny knowledge of an operation should it be
> disclosed."

And the findings, p. 277: "**The doctrine is the antithesis of accountability.**"

Two quotations that are pure texture. Richard Helms on the Special Group: it "was the mechanism … set
up … to use as a **circuit-breaker** so that these things did not explode in the President's face."
And Bromley Smith, NSC staff 1958–69, on how literally the doctrine was taken: "**The government was
authorized to do certain things that the President was not advised of.**"

**UNVERIFIED:** the text of NSC 10/2 (1948), the usual cited origin of the "plausibly disclaimed"
formula, was not retrieved. Treat that attribution as unconfirmed.

### 6.2 What a Presidential Finding looks like

**DOCUMENTED, and the best single artefact in this section.** The retroactive Iran Finding of 5
December 1985, with Casey's cover memo —
https://nsarchive.gwu.edu/sites/default/files/documents/3224971/02-CIA-Draft-Presidential-Finding-Scope-Hostage.pdf

Casey to Poindexter, 26 November 1985: "Pursuant to our conversation this should go to the President
for his signature and **should not be passed around in any hands below our level**."

The Finding itself — note the title quotes Hughes-Ryan directly:

> "**Finding Pursuant to Section 662 of the Foreign Assistance Act of 1961, As Amended, Concerning
> Operations Undertaken by the Central Intelligence Agency in Foreign Countries, Other Than Those
> Intended Solely for the Purpose of Intelligence Collection**
>
> …Because of the extreme sensitivity of these operations, in the exercise of the President's
> constitutional authorities, **I direct the Director of Central Intelligence not to brief the Congress
> of the United States**…
>
> **SCOPE** — Hostage Rescue – Middle East
>
> **DESCRIPTION** — The provision of assistance by the Central Intelligence Agency to private parties
> in their attempt to obtain the release of Americans held hostage in the Middle East. Such assistance
> is to include the provision of transportation, communications, and other necessary support. As part
> of these efforts **certain foreign materiel and munitions may be provided to the Government of
> Iran**…
>
> **All prior actions taken by U.S. Government officials in furtherance of this effort are hereby
> ratified.**"

The two-column SCOPE / DESCRIPTION layout, the anodyne SCOPE line, the buried munitions clause and the
retroactive ratification sentence are, together, the entire aesthetic. This is also the Finding
Poindexter later destroyed.

### 6.3 Iran-Contra — the mechanics

**The Enterprise — DOCUMENTED**, *Report of the Congressional Committees Investigating the Iran-Contra
Affair* (S. Rep. 100-216 / H. Rep. 100-433, Nov. 1987), Executive Summary:

> "Secord and his associate, Albert Hakim, created what they called 'the Enterprise,' **a private
> organization designed to engage in covert activities on behalf of the United States**. The
> Enterprise… **had its own airplanes, pilots, airfield, operatives, ship, secure communications
> devices, and secret Swiss bank accounts.** For 16 months, it served as the secret arm of the NSC
> staff…"

**The famous quotation is CONTESTED — handle with care.** The four-adjective string "the off-the-shelf,
self-sustaining, stand-alone entity" **does not appear anywhere in the congressional report.** What is
there: the majority's "a '**stand-alone,' 'off-the-shelf,' covert capacity**"; the minority's
"off-the-shelf, self-sustaining"; and North's own testimony, "**an overseas entity that was capable of
conducting operations… that was a stand-alone**… **self-financing, independent of appropriated
monies**." **Use the majority's phrasing or North's own words; both are string-verified.**

**And the claim is disputed within the official record**, which is a better story than the tidy
version. Minority views: two people close to Casey — Deputy DCI John McMahon and DDO Clair George —
"both denied Casey would ever have countenanced such an idea. '**My experience with Bill Casey was
absolute,**' said George. '**He would never have approved it.**'" Casey's terminal illness prevented
his testifying; he died in May 1987. **CONTESTED: one uncorroborated attribution to a dead man,
believed by the majority, denied by his two deputies.**

**The corporate machinery — DOCUMENTED**, Walsh, *Final Report of the Independent Counsel for
Iran/Contra Matters* (1993), ch. 8 — https://irp.fas.org/offdocs/walsh/chap_08.htm

> "Secord and Hakim founded Stanford Technology Trading Group International (STTGI) in 1983… **Financial
> management of all Enterprise assets was done in Switzerland by Compagnie de Services Fiduciaire
> (CSF)**… The services CSF provided… included **the establishment of financial accounts and shell
> corporations**, and bookkeeping."

"More than $47.6 million flowed from the Iran and contra operations into the Swiss Enterprise
accounts." **Lake Resources Inc.** "pleaded guilty to the corporate felony of theft of Government
property." Other named entities: Energy Resources, Gulf Marketing, Udall Research Corp., **Amalgamated
Commercial Enterprises** ("a shelf company registered in Panama, to hold title to the aircraft").

**"Commercial cut-out" — DOCUMENTED as a term of art used by the participants.** Secord was brought in
as "a '**commercial cut-out**': a conduit for the money to be paid by Iran to the United States for the
missiles." The CIA officer's reason, deadpan: "I wasn't particularly anxious for an Israeli Government
entity to know what my account was."

**Sanitising an entity in real time — DOCUMENTED, and unbeatable as texture.** North to Poindexter by
PROF note, after the Santa Elena airstrip was exposed:

> "**Udall Resources, Inc., S.A. is a proprietary of Project Democracy. It will cease to exist by noon
> today. There are no USG fingerprints on any of the operation and Olmstead is not the name of the
> agent — Olmstead does not exist.** We have removed all Udall Resources … to another account in
> Panama, where Udall maintained an answering service and cover office. The office is now gone as are
> all files and paperwork."

Note that a private shell is called "**a proprietary**," borrowing the CIA's own word. And the press
guidance drafted in response: the airstrip had been offered to Costa Rica "by the owners of the
property who had apparently decided to abandon plans for a tourism project."

**What the committees concluded — DOCUMENTED:**

> "**Privatization.** The NSC staff turned to private parties and third countries to do the Government's
> business… **Activities normally conducted by the professional intelligence services — which are
> accountable to Congress — were turned over to Secord and Hakim.**"

> "**Deniability replaced accountability.**… '**Plausible denial,' an accepted concept in intelligence
> activities, means structuring an authorized covert operation so that, if discovered by the party
> against whom it is directed, United States involvement may plausibly be denied… In no circumstance,
> however, does 'plausible denial' mean structuring an operation so that it may be concealed from — or
> denied to — the highest elected officials of the United States Government itself.**"

### 6.4 Proprietaries — the deniable airline

Church Committee Book I, **Section XI, "Proprietaries"**, is the single richest chapter for this
project's purposes.

**The definitions — DOCUMENTED.** Chapter opening (p. 205):

> "**Proprietaries are business entities, wholly owned by the Central Intelligence Agency, which either
> actually do business as private firms, or appear to do business under commercial guise.** They are
> part of the '**arsenal of tools**' the CIA believes it must have…"

Glossary version, which names the purpose rather than the form: "ostensibly private commercial entities
capable of doing business which are established and controlled by intelligence services **to conceal
governmental affiliation of intelligence personnel and/or governmental sponsorship of certain
activities**…"

**The structural ladder — DOCUMENTED.** Three tiers: **operating** companies that really trade;
**non-operating** shells; and **notional** entities that are a name and a bank account.

> "All nonoperating proprietaries do have **nominee stockholders, directors, and officers**… The company
> address may be a Post Office box, a legitimate address provided by a **cleared and witting** company
> official… The nonoperating proprietaries maintain bank accounts, generate business correspondence,
> **keep books of account which can withstand commercial and tax audit**, file State and Federal tax
> returns… They are moderately capitalized, generally at around $5,000…"

> "[Notional entities] are not legally registered but have names and bank accounts controlled by the
> Agency. The Agency arranges domiciliary addresses and any queries are referred to the Agency
> specialists concerned."

Use the report's words — "nominee stockholders," "legal straw men," "cleared and witting." The popular
phrase "boards of cleared attorneys" is folklore.

**Air America — DOCUMENTED.**

> "**Air America, the Agency's largest proprietary, provided air support for CIA operations in Southeast
> Asia. This support was under cover of a commercial flying service fulfilling United States Government
> contracts.**"

The ownership layering: "**Pacific Corporation held title to 40 percent of the equity in Air America
while the remainder was ostensibly owned by Chinese who gave deeds of trust to the Agency for their
shares. For purposes of international law this overt arrangement demonstrated that the company was
majority-owned and controlled by Chinese.**"

And the overt/covert board mechanism — the most game-usable passage in the chapter:

> "**The overt board of directors in New York City passed a resolution organizing an overt executive
> committee**, which consisted of the CIA consultant and two other directors. **Covertly, the Agency
> added its own representatives to this committee**…"

⚠ Church Book I's account of the 1949–50 CAT/Air America origin is internally muddled and uses "Air
America" retroactively for the Chennault-era airline. **Do not rely on Church for corporate genealogy
of 1949–59**; rely on it for structure, control and disposal, where it is precise.

**Southern Air Transport — DOCUMENTED, and this is the deniable airline in full.**

*Why CIA bought it: a regulatory problem solved by acquisition.* New 1960 MATS contracting rules
required bidders to hold a Supplemental Certificate of Convenience and Necessity, which Air America
could not obtain.

> "**In order to avoid lengthy public hearings, which would be time-consuming and generate public
> exposure, it was decided that the ownership of the company to be acquired must be kept completely
> separate from Air America. This solution was concurred in by the CAB, DOD, the CIA, and Air America
> management.**"

*The purchase:* "on August 5, 1960, the CIA exchanged **$307,506.10** for all outstanding shares of
capital stock of SAT… **The Agency owned these shares in the name of a former board member of Air
America.**"

*The two-division structure — a real airline on one side, an operational asset on the other:* "the
Pacific Division performed the MATS contract and supported Agency 'heavylift' requirements in East
Asia. The Atlantic Division continued to operate in the Caribbean and South America, doing the same
sort of flying SAT had done prior to Agency acquisition. **The Atlantic Division was also able to
furnish support for certain sensitive operations.**"

*The divestiture:* the DCI determined "**we no longer should retain air proprietaries purely for
contingent requirements**." SAT was sold 31 December 1973 for $6,470,000.

**And the mechanism that matters most for a game premise — DOCUMENTED:** divestiture sometimes carried
a continuing-service covenant. "In several cases transfer of the entity was conditioned as an agreement
that **the proprietary would continue to provide goods or services to the CIA**."

**SAT in 1986 — DOCUMENTED, and be precise.** The Iran-Contra report calls it "**a former CIA
proprietary charter airline based in Miami, Florida**." It handled aircraft maintenance for the Contra
resupply operation; its president was one of six people issued NSA-supplied KL-43 encryption devices by
Oliver North on 15 January 1986. **Folklore correction:** the Hasenfus C-123 was an *Enterprise*
aircraft — the report says documents aboard "connected it to" SAT. Say *connected to*, not *operated
by*. And **SAT was not CIA-owned in 1986**; it had been sold thirteen years earlier. The documented
reality — a divested proprietary re-entering covert logistics as a private contractor — is stranger and
better than the folklore.

**Money, and one gift of a phrase.** A 1958 General Counsel ruling held that proprietary income "need
not be considered miscellaneous receipts to be **covered into the Treasury**"; reversed in February
1975. The Committee's own audit finding contradicts the chapter's reassuring opening: "There is no
broad management audit in program terms, but rather only a financial audit… Moreover, **there have been
no outside audits of any kind**."

The Committee found "**no substance**" to the charge that air proprietaries were involved in drug
trafficking. **That finding is the record. Do not present the allegation as established, and do not
present the finding as the last word either.**

The constitutional framing, worth the whole chapter:

> "In a totalitarian society… governmental and 'private' enterprises are essentially one… In our
> society, however, that which is governmental is generally distinct from that which is private…
> Proprietaries are no exception to this dilemma. **They are, in fact, the embodiment of it.**"

### 6.5 The vocabulary — folklore separated from record

Church Book I contains a **Glossary of Selected Intelligence Terms**, written by a Senate committee
from Agency usage. It settles most of these. Statuses below were established by direct string search
against the three corpora named at the head of this section.

| Term | Status | Evidence |
|---|---|---|
| **special activities** | **DOCUMENTED — statutory-grade** | E.O. 12333 §3.4(h). Church calls it a euphemism explicitly. |
| **plausible denial** | **DOCUMENTED as doctrine; NOT in any statute or EO** | Church assassination report §II.B; Iran-Contra Exec. Summary. |
| **executive action** | **DOCUMENTED** | Church glossary: "generally an euphemism for assassination." IG 1967: "a **general standby capability**." Cryptonym **ZR/RIFLE**; asset **QJ/WIN**. |
| **termination with extreme prejudice** | **FOLKLORE — negative result** | "extreme prejudice" returns **zero hits** across Church Book I, the Church assassination report, and the entire Iran-Contra report. An entire Senate report on CIA assassination does not contain the phrase. Journalism and fiction — popularised by *Apocalypse Now*. State it as "not present in the primary investigative record." |
| **asset** | **DOCUMENTED** | Glossary: "**Any resource — a person, group, relationship, instrument, installation, or supply — at the disposition of an intelligence agency**… normally applied to a person who is contributing to a CIA clandestine mission, but is not a fully controlled agent." The asset/agent distinction is real and precise; games usually collapse it. |
| **cut-out** | **DOCUMENTED, twice** | Glossary: "a person who is used to conceal contact between members of a clandestine activity." By 1986 extended to firms — "commercial cut-out." |
| **sheep-dipping** | **DOCUMENTED — and it applies to aircraft** | Glossary: "The utilization of a military instrument (**e.g., an airplane**) or officer in clandestine operations, usually in a civilian capacity or under civilian cover, **although the instrument or officer will covertly retain its or his military ownership or standing.**" And: officers "**appear to resign from the military yet preserve their place for reactivation**." |
| **cover** | **DOCUMENTED** | Glossary: "A protective guise used by a person, organization, or installation…" |
| **notional** | **DOCUMENTED** | See §6.4. A superb word — an entity that exists only as an idea with a bank account. |
| **non-official cover / NOC** | **UNVERIFIED for the period** | Zero hits in Church Book I. "**Official cover**" and "**deep cover**" *are* present. No primary citation found; may be authentic later tradecraft. |
| **deniable** | **DOCUMENTED as participants' own speech** | Iran-Contra: Poindexter "wanted to give the President 'deniability'"; McFarlane's "you and me in what should be deniable for both of us." |

Two more worth having: **"circuit-breaker"** (Helms) and **"cooperative interface"** (Church Book I, on
CIA's relationships with the SEC and IRS regarding proprietaries).

### 6.6 The through-line, and where it stops

Three verified links, and then a wall.

1. **State's 1950 condition.** CIA could own an airline "on the understanding that we would divest
   ourselves of the private enterprise as soon as such a divestment was feasible." The Committee's dry
   follow-up: "The divestiture of these air proprietaries was not initiated until 1975." A twenty-five
   year "temporary" arrangement.
2. **Divestiture with a service covenant** — the documented mechanism by which state-owned becomes
   contractor-owned without the flying stopping.
3. **The 1986 proof of concept.** Southern Air Transport, sold in 1973, doing covert government air
   logistics thirteen years later as a private firm. Not a proprietary. A contractor.

**UNVERIFIED — the modern leg is not built.** Claims about contractor aviation from Plan Colombia
forward are **unsourced in this dossier**; the search budget was exhausted. If that leg is wanted it
needs a fresh session.

---

## 7. The Vietnamese — people, not scenery

ADR-0003's anti-glorification stance and the standing guardrail "keep the other side human" require
this section. It is also the section where a Western team is most likely to get the tone wrong, so it
opens with a source-criticism warning rather than with material.

### 7.0 Read this before using any "voice of the other side"

Almost every English-language record of what the other side thought passes through one of three
filters.

**Filter 1 — the RAND interviews were conducted in jails and defector camps.** RAND ran approximately
**2,400 interviews between August 1964 and December 1968, producing some 62,000 pages, released
publicly in June 1972** (RAND RM-4911-2 foreword;
https://www.rand.org/pubs/research_memoranda/RM4911-2.html). **DOCUMENTED.** The sample was never
random. RAND's own official history is candid:

> "there was no central file of defectors and prisoners, so the team did not know what sources would
> be waiting when they arrived… **It was not possible to select a scientific, statistically valid
> sample.**"
> — Mai Elliott, *RAND in Southeast Asia: A History of the Vietnam War Era*, RAND CP-564 (2010),
> p. 108, https://www.rand.org/content/dam/rand/pubs/corporate_pubs/2010/RAND_CP564.pdf

**Filter 2 — the interviewers were Southern anti-communists, many of them 1954 refugees from the
North.** "**Many had fled the North with their families before Ho Chi Minh came to power in 1954.** As
a result, they had a visceral dislike and a profound fear of communism." (Elliott, p. 153)
**DOCUMENTED.**

**Filter 3 — the analysis was fought over inside RAND, and one side is now discredited.** Leon Gouré's
reports told the Air Force what it wanted to hear; Konrad Kellen was brought in to re-read the same
interviews. RAND's Gus Shubert: "Goure's line was shoot more, bomb more, because the more you shoot
and the more you bomb, the more they blame the Viet Cong" — which in Shubert's view had "**no
validity to that at all**" and was reached by "selecting among the things that they said carefully."
Wohlstetter's circle nicknamed it "**the How I Learned to Love to Be Bombed Study**." (Elliott,
pp. 169–170) **DOCUMENTED.**

**Design consequence: use Kellen and Zasloff/Donnell as the load-bearing RAND sources; use
Gouré-derived findings only with the caveat attached.**

And Kellen's own warning about his material, recorded by Ellsberg — a man who had worked German and
Korean POW interrogations: "Prisoners and defectors tell you what they think you want to hear.
**These people, you can't get them to say anything critical of their regime.**" (Ellsberg, *Secrets*,
p. 290, quoted in Elliott p. 231) **DOCUMENTED.**

### 7.1 Who the other side actually were

**Not one army — three military tiers plus a parallel civil administration. DOCUMENTED**, Elliott
pp. 263–264, summarising David Elliott & W. A. Stewart's Dinh Tuong study: "the Viet Cong's
effectiveness depended on a carefully maintained balance among its three types of units:
**guerrillas, provincial Local Force, and regional Main Force**… **Within this interdependent and
mutually reinforcing military system, the Local Force represented the key link.**"

The guerrilla was a farmer with a rifle who slept at home. The Local Force man operated in his own
district. The Main Force soldier was full-time. **PAVN** — the North's regular army — was a fourth
thing again.

**The 1964 finding on the insurgency's spine — DOCUMENTED**, Elliott p. 70, summarising Donnell,
Pauker & Zasloff: "**These veterans of the war for independence against the French — men now in their
30s — whose commitment had deepened with time… formed the backbone of the insurgency**… They saw the
insurgency in the South as a nationalist struggle, a continuation of the fight for Vietnamese
independence." And the conclusion that made Westmoreland sit up: the insurgency had to be seen not as
a "jungle insurgency led by a band of committed Communist cadres" but as "**a war waged by an
alternative government**." (Elliott, p. 71)

**Tet 1968 broke the southern NLF and the North filled the gap — DOCUMENTED.** Some battalions
suffered "up to 80-percent casualties"; a blow "from which the NLF forces have not recovered."
(Elliott, pp. 407–408)

**Design consequence: a 1965 fight and a 1970 fight are against different people.** Early: local men,
some of them the same men who farm the field you are standing in. Late: northern conscripts a
thousand kilometres from home who have never seen this province.

**Why they joined — RAND's own abstract, DOCUMENTED**, Donnell, Pauker & Zasloff, *Viet Cong
Motivation and Morale in 1964*, RM-4507/3-ISA,
https://www.rand.org/pubs/research_memoranda/RM4507z3.html (145 interviews):

> "Whereas older interviewees went into the Viet Minh mainly for nationalist reasons, the younger
> generation has joined the VC for a mix of motives including **protest against social injustice at
> the village level, lack of educational and career opportunity on the GVN side, and antipathy to
> being drafted by ARVN.** The three-man cells… are a politicized 'buddy system'… **Most interviewees
> believed the war would last a long time and would end not in a VC victory, but in a gradual
> exhaustion of the enemy.**"

### 7.2 In their own words

Konrad Kellen, *Conversations with Enemy Soldiers in Late 1968/Early 1969*, RAND RM-6131-1-ISA/ARPA
(1970), https://www.rand.org/pubs/research_memoranda/RM6131-1.html — 22 prisoners. The report is a
scan with no text layer; the passages below were OCR'd from it. Speaker codes are Kellen's.
**All DOCUMENTED, but spot-check against the PDF before any of it reaches a player.**

**Why they joined — none of these are ideological abstractions:**

> "The unjust death of my uncle bothered me very much. The GVN Rangers killed my uncle and beat me up
> when I was just 12 years old because they suspected us of being VC… **At that time I didn't know
> what the Front was doing** but I did know that the Front was fighting against the GVN." … "Sincerely
> speaking, when I joined the Front I just wanted to take revenge. I did not expect anything from the
> Front." (K-21)

> "My people suffer. Myself and my family are enslaved by the Americans." — *How were you enslaved?* —
> "We were poor and had a difficult life. The Americans bombed and shelled my village. **My house and
> my orchard were destroyed. My father, my relatives, and other countrymen were killed.**" (K-9)

> "Sincerely speaking, while I lived in the GVN-controlled area, **I did not have the slightest idea
> of what the war was about.**… **The Vietnamese farmers worked hard in their fields and their
> gardens. Their lives depended on the crops they grew.** Unfortunately, the Americans brought over
> bombs and shells to destroy their fields and gardens which were their dearest property." (K-2)

> "Since I lived in a VC-controlled area, I had to work for the Front." (K-19)
> "I joined of my own free will, that's all." — asked whether the Front met his hopes — "I didn't have
> any hopes and expectations."

**The hardship, in the concrete detail a game needs:**

> "**Our rice ration always remained the same — one liter per day. The food allowance also remained the
> same — eight piasters a day. Our monthly pocket money was sixty piasters per man.** However, we were
> short of foodstuffs to go with the rice." (K-2)

> "When we first arrived in the South, we were tired and many of us had malaria." (K-11) — with "20 or
> 30 out of 70" down with malaria in six months (K-8)

> "in some cases they were unable to remove all the wounded or dead because of enemy air attacks after
> the ground attacks were over. In such cases, **the men had to concentrate their efforts on removing
> the wounded, and of course the dead were left behind.**" (K-11)

> Greatest hardship since Tet: "moving to another place immediately after we attacked some place in
> order to avoid the artillery and the planes… **They would feel lonely and depressed if they had to
> stay too long in the jungle.**" (K-15)

**The three-man cell — the actual mechanism of cohesion, and it reads as friendship, not coercion:**

> "During the infiltration to the South, the other man in my cell had given me a lot of assistance such
> as carrying my gun and ammunition or other items for me when I was tired or sick." (K-16)
> "**When I quarreled with someone, the other two men helped me to calm down… When I got sick, the
> other two men called the medic and got medicine for me.**" (K-11)
> "I think human beings have the tendency to work with friends rather than working alone." (K-8)

And its other function, from a battalion records clerk: "Since the cell had only three men, it was
easy for them to know whether anyone among them was killed or wounded." (K-6)

**Homesickness, held at arm's length:**

> "When I was not in combat, I thought of my people, my family… **But when I went on operations, I
> never thought of my family.**" … "**We all agreed that as long as the war still goes on we cannot
> place the happiness of our own upon our obligation to the country.**" (K-11)

> "At the time when all of the men in my squad were present, we had a pretty interesting life. **But
> since the time some of us were killed or wounded, we were sad and thoughtful.**" (K-12)

**Not all of them were true believers** — Kellen deliberately keeps the wobblers in: a private who "was
very scared of being killed and was tired of the hardships. But I did not want to betray my side, my
family, and my country", refused Party membership "because I was often criticized for having love
affairs with various girls." (K-8) And one genuinely equivocal: "**I cannot tell yet because as far as
I can see it, in their fighting neither the United States nor the Front are prevailing.**" (K-22)

**The one enemy weapon that frightened them was the B-52**, and they said so about a leaflet: "The only
type of propaganda that I believed was about the B-52 bombers… I already knew of the effectiveness of
the B-52s." (K-4)

**Why they quit — and it was rarely ideology. DOCUMENTED**, Elliott pp. 192–193, summarising RAND's
Chieu Hoi study (302 interviews): "**ideological reasons hardly featured in defection. Most of the
defectors left the Viet Cong for personal reasons**… the physical hardships… their fear of death as
the war grew more ferocious, and **their longing to return home**."

### 7.3 The diaries — and a hard rights warning

**Đặng Thùy Trâm**, a 24-year-old Hanoi-trained physician who volunteered for a battlefield clinic in
Quảng Ngãi and was shot dead on 22 June 1970. Her diary was taken from the battlefield by an American
who was told to burn it and did not. English: *Last Night I Dreamed of Peace*, trans. Andrew X. Pham,
Crown/Harmony 2007. The physical diaries are at the Vietnam Center, Texas Tech.

**READ THIS BEFORE USING A SINGLE WORD OF HERS.** The same archive page states:

> "**The English language version of the diaries of Dr. Dang Thuy Tram have been removed from our site
> at the request of the family.**"
> — https://www.vietnam.ttu.edu/resources/tram_diary/ **DOCUMENTED**

The family actively controls this material and has already withdrawn it once. **Treat Trâm as reading
for the writing room, not as a quotable asset, unless licensed.** The widely-circulated passages are
**UNVERIFIED** against the published text.

**Bảo Ninh, *The Sorrow of War*** (Vietnamese original *Thân phận của tình yêu*, 1990) — the canonical
Vietnamese-language literary account, from the winning side, and a book about trauma rather than
triumph. Bảo Ninh served in the PAVN 27th Youth Brigade. **DOCUMENTED.**

**The RAND interview transcripts themselves — 62,000 pages — are the single largest untapped corpus of
ordinary Vietnamese speech from the war.**

### 7.4 The rice year, and the anachronism trap

**What 1968 actually looked like — single-cropped and flood-timed. DOCUMENTED**, *Area Handbook for
South Vietnam*, DA Pam 550-55 (1967), p. 324,
https://archive.org/download/DAPAM550-55/DAPAM550-55_djvu.txt:

> "**Most of the farmers in the Mekong Delta produce only one rice crop a year**, relying on rainfall
> and the annual flood… It begins in June with transplanting or direct sowing in the fields from July
> to September. **Most harvesting starts in December and continues through February.**"

**THE ANACHRONISM WARNING, in one line: a 2020s satellite image of the Mekong Delta is not 1968.** The
rectilinear grid of ring-dyked triple-crop compartments is a 2000s engineering product — "The total
length of the high dike compartments has increased rapidly in the past 10 years… **The compartment
areas range from 50 to 500 ha**" (Manh et al., *Hydrology and Earth System Sciences* 18 (2014),
https://hess.copernicus.org/articles/18/3033/2014/hess-18-3033-2014.pdf, "past 10 years" ≈ 2004–2014).
**DOCUMENTED.** The 1964–65 GVN map divided the delta into three zones — **single transplanting /
double transplanting / floating rice** — which is the correct landscape key.

**Floating rice — a landscape with no visible field. DOCUMENTED**, DA Pam 550-55 p. 326: "The seed is
sown in April and May when the soil is dry. While the floodwaters cover the field, the rice, which is
not transplanted, grows with great rapidity and, supported by the water, **reaches a tremendous
length, with its tip just above the waterline.**" Over half a million of ~6.2 million acres of 1964
wet rice was floating rice.

**Central coast:** double-cropped, "growing season is from October or November to February or March",
farms ≤5 acres, and a paintable detail — "**operating a paddle wheel to lift water into the fields
during the growing season.**"

**Red River Delta calendar: NOT RESEARCHED TO STANDARD.** The chiêm/mùa folk vocabulary is
**UNVERIFIED**; the canonical source is Gourou, *Les paysans du delta tonkinois* (1936), not online.

### 7.5 What a paddy physically looks like — for painters

**The mirror is a film, not a pond. DOCUMENTED**, IRRI Rice Knowledge Bank (**note: this host refuses
HTTPS — fetch over plain http**), http://www.knowledgebank.irri.org/step-by-step-production/pre-planting/land-preparation:
bunds "no wider and taller than 50 cm x 30 cm"; spillway "3−5 cm"; "Irrigate the field with **2−3 cm
of water**". So the sky-mirror stage is **2–5 cm of water over a churned surface**, with bunds reading
as a low raised grid and a transplanter standing **ankle-deep, not shin-deep**.

**Puddling destroys soil structure deliberately** — "a totally 'puddled' soil which actually destroys
soil structure." The plough is "a **simple buffalo-drawn wooden plow with a metal cutting blade**" — a
single-blade ard that stirs and slices; **no corduroy of turned furrow slices**. **DOCUMENTED.**

**The season is flooded almost to the end, then drained:** "Rice is typically grown in bunded fields
that are **continuously flooded up to 7−10 days before harvest**." So **the harvest scene is dry
cracked crust under gold stubble, not water.** **DOCUMENTED.**

**The nursery is the strongest colour contrast in the cycle:** seedbed "approximately one-tenth the
size of the field to be planted" — **one square of saturated dense green per ten fields of bare brown
water.** **DOCUMENTED.**

**Period-correct plant habit — this matters visually. DOCUMENTED**, DA Pam 550-55 p. 326: "The
early-maturing varieties develop in as few as 120 days; the late varieties require 5 to 6 months."
**A 1968 Mekong crop is a 150–180 day tall traditional variety that lodges, not a stiff 110-day
semi-dwarf. Modern rice-field reference photos are the wrong silhouette.**

**Water buffalo — DOCUMENTED**, DA Pam 550-55 pp. 328–329: "The neglect of livestock breeding during
the Indochina War, combined with the slaughter of buffalo for food, reduced the number of buffalo by
as much as 50 percent… **In 1964 the total number of buffalo was reported to be 800,000 as compared to
222,000 in 1954.** The slaughter of buffaloes under 10 years of age has been prohibited since 1955."

**A buffalo in 1968 was a capital asset rebuilt out of near-extinction under a slaughter ban. Killing
one is not set dressing.**

### 7.6 Village structure — and the single most important fact in this section

**Administrative nesting — DOCUMENTED**, Pentagon Papers IV.B.2 p. 3: "**The hamlet is the smallest
organized community in rural South Vietnam. Several hamlets (typically 3-5) comprise a village.**"

**The southern linear settlement — DOCUMENTED**, DA Pam 550-55 p. 14: "**Levees and dykes built for
flood control are used extensively as village sites, and are often strung out along riverbanks and
roads. During the flood period, the only dry land is that forming the banks of the canals and
rivers.**"

**The đình and the ritual year — DOCUMENTED**, p. 189. Four village celebrations a year, two of them
**Hạ Điền (Descent to the Fields)** and **Thượng Điền (Ascent from the Fields)**. **The ritual year is
bolted to the agricultural year.**

**House and materials, with the class signal running the right way — DOCUMENTED**, pp. 136–137: "small,
dirt-floored thatch structures. Furnishings consist for the most part of **a simple ancestral altar —
the focal point of the main room** — a few tables, chairs and hardwood planks which serve as beds."
Roofing: "**Leaves of the nipa palm, which grows in the tidal areas, are used for thatching.**"

**TOMBS IN THE FIELDS — the hinge on which the whole relocation tragedy turns, and it is documented in
the US Army's own handbook. DOCUMENTED**, DA Pam 550-55 pp. 64, 102, 192:

> "Because of the observance of the Cult of the Ancestors, the Vietnamese are bound to their
> birthplaces, and **to leave the family tombs and ancestral villages remains for most of them an
> extremely serious step.** This has been an important reason for the limited success of government
> resettlement schemes… It also had a restrictive influence on the program of building fortified
> (strategic) hamlets."

> "he tries to remain **near the graves of his forebears, even in military operational areas, and will
> leave only under extreme duress.**"

> "**Status demands that their family burial grounds have tombs of concrete or cement.**" … "**Land
> dedicated to the Cult of the Ancestors is set aside by each family, and the revenue from it is used
> to pay the expenses involved.**"

**Visual payload: concrete tombs standing free in working paddy, sized by family wealth, sited by
geomancy rather than convenience — and a parcel of rice land whose entire yield exists to pay for the
rites. A player who bulldozes a paddy is bulldozing a graveyard and a pension fund.**

**Clothing — one sentence worth the whole subsection. DOCUMENTED**, pp. 101, 137–138: "if they are of
cotton, **the color is white — never the black garb of poor peasants.**" **In 1965 South Vietnam, black
cotton was a class marker read on sight; white cotton was the affordable step up.** The handbook
describes the áo bà ba cut precisely — collarless, side-slit, loose trousers, both sexes — without
ever using the name.

**Specific dyestuffs, nón lá construction, the đòn gánh carrying pole, sampan typology, ox-carts and
market organisation: NOT RESEARCHED TO STANDARD.** A real gap for an art team.

### 7.7 The Strategic Hamlet Program

**The US government's own retrospective verdict — DOCUMENTED**, Pentagon Papers IV.B.2 pp. iii, 2,
https://nara-media-001.s3.amazonaws.com/arcmedia/research/pentagon-papers/Pentagon-Papers-Part-IV-B-2.pdf:

> "**all failed dismally because they ran into resentment if not active resistance on the part of the
> peasants**… **Each had inspired antagonism among the peasants who were moved from their ancestral
> lands and away from family burial plots.**"

**Operation Sunrise, 22 March 1962 — the first one, and the template. DOCUMENTED:**

> "**The government was able to persuade only seventy families to volunteer for resettlement. The 135
> other families… were herded forcibly from their homes.**… Some of them came with most of their
> meager belongings. Others had little but the clothes on their backs. **Their old dwellings — and many
> of their possessions — were burned behind them.**"

**The three named injuries:** "corvee labor, GVN failures to reimburse the farmers for losses due to
resettlement, the dishonesty of some officials" — and whether peasants were "**given adequate
opportunity to attend their crops**." **Given the transplanting-to-harvest calendar in 7.4, that third
one is a food-security injury, not an inconvenience.**

**The numbers claimed, and why they were meaningless. DOCUMENTED as claims:** as of 30 September 1962,
11,316 planned, 3,225 completed, **4,322,034 people in completed hamlets** — "33.39%" of the
population; by November 1963, ~9,000 hamlets and 8 million people. **The collapse test settles it**
(IV.B.2 p. 35): "**The Strategic Hamlet Program … died with them. The inhabitants who had wanted to
leave the hamlets did so in the absence of an effective government.**" And DA Pam 550-55: "the
residents in many instances destroyed the defenses."

**The best evidence that most of the 9,000 were paper is that the population walked out and tore down
the fences within weeks.**

**Refugee generation as policy — the Komer cable, verbatim. DOCUMENTED**, Pentagon Papers IV.C.8 p. 64:

> "For Porter from Komer: We here deeply concerned by growing number of refugees… **Of course, in some
> ways, increased flow of refugees is a plus. It helps deprive VC of recruiting potential and rice
> growers**…"

**Displacement statistics were known to be manipulated. DOCUMENTED**, GAO reporting for the Kennedy
Subcommittee, December 1970, https://archive.org/details/laoscambodiaviet00comm_0: official figures
were "**misleading and significantly understated**"; "**The official number of refugees was reduced by
more than 1 million in 1969 — from 1,400,000 in February to some 268,000 in December.**" And, in an
almost perfect bureaucratic circle, at My Trang ~800 relocated people could not be counted because
"**GVN policy specifies that refugees cannot originate from pacified areas.**" Also: "at least 44
percent of refugee sites were reporting 'questionable data' to Saigon."

*(That last cluster belongs as much to section 4 as to this one — it is the same failure mode, applied
to people.)*

### 7.8 Casualties — CONTESTED, present the whole range or none of it

**Never quote a bare midpoint. The spread is the finding.**

**Two US government bodies, in one 1970 printing, 4× apart. DOCUMENTED as a documented
disagreement:** official hospital admissions gave "some 245,715 civilian war casualties since records
were first compiled in 1967," while the Kennedy Subcommittee's own field estimate put "the total
number of civilian war casualties since early 1965 at **more than 1,000,000 — including at least
300,000 deaths.**"

**The demographic estimate (lower):** Hirschman, Preston & Vũ Mạnh Lợi, *Population and Development
Review* 21:4 (1995), doi:10.2307/2137774 — **966,000 war deaths 1965–1975**. Its acknowledged bias, as
reported by Obermeyer: "**the Vietnam life history survey results are biased downwards because rural
areas with higher mortality were under-represented**… the small sample (403 households…)."

**The sibling-survey estimate (higher):** Obermeyer, Murray & Gakidou, *BMJ* 336:1482 (2008),
https://pmc.ncbi.nlm.nih.gov/articles/PMC2440905/ — **DOCUMENTED**, read directly:

| Vietnam | WHS estimate (95% CI) | Uppsala/PRIO |
|---|---|---|
| Total violent war deaths 1955–2002 | **3,812,000 (2,207,000 – 5,942,000)** | 2,096,000 |
| per year, 1965–74 | **170,000 (102–255k)** | |

The paper's own honesty: the survey "captured a total of **290 war deaths** in Vietnam, of which 155
were reported between 1965 and 1975." **A very small number of observed deaths scaled to millions —
which is why the confidence interval is nearly four million wide.**

**The American baseline, for scale — DOCUMENTED**, NARA/DCAS,
https://www.archives.gov/research/military/vietnam-war/casualty-statistics: **58,220** US military
fatal casualties; KIA 40,934; peak year 1968, 16,899.

**How to state it anywhere in this project:** *Estimates of Vietnamese war deaths range from roughly
one million to nearly four million. The lower figure comes from a 1995 demographic reconstruction with
an acknowledged downward bias; the higher from a 2008 household-survey extrapolation built on 290
observed deaths. Both are honest attempts at an unanswerable question.* **Anything more precise than
that is a lie.**

### 7.9 The South Vietnamese — the most forgotten party

The best sources are free and were written by ARVN generals for the US Army Center of Military History
after 1975. Đồng Văn Khuyên, *The RVNAF* (CMH Pub 92-7),
https://archive.org/download/cmh-pub-92-7-nsia/CMH_Pub_92-7_djvu.txt; James Lawton Collins Jr., *The
Development and Training of the South Vietnamese Army 1950–1972* (CMH Pub 90-10-1),
https://archive.org/download/CMHPub90-10-1/CMHPub90-10-1_djvu.txt.

**Class was written into the statute. DOCUMENTED**, Khuyên, on Decree No. 29 of 1952, still governing:

> "**Youths with a baccalaureate or higher degree were classified as officer resources. Those with a
> primary education diploma were classified as NCO resources and those who had not reached this level
> as EM resources.**"

**In a country where the *baccalauréat* was an urban, largely French-schooled, disproportionately
Catholic credential, the rifle companies were filled by peasants and the officer corps drawn from the
towns, by law.** This is the sharpest single ARVN fact in the dossier.

**Service became indefinite. DOCUMENTED**, Khuyên: after general mobilisation on 19 June 1968, "**The
term of military service was no longer specified, which implied that it was extended indefinitely as
long as the war continued.**"

**Pay lost to inflation. DOCUMENTED**, Khuyên: "**income rose only less than 3 times for officers and 5
times for enlisted men during the period from 1964 to 1972 while consumer prices rose 8.5 times and
the price of rice, 14 times.**" Combat incentive pay granted November 1971: **US$11.00 per month**. And
the detail that says everything (Collins): when field rations were issued, ~25¢ was deducted, so "**he
preferred not to receive the ration and sold it when it was issued to him.**"

**The families are inside the wire. DOCUMENTED**, Khuyên:

> "the spectacle of **makeshift shelters erected near or inside a company's or battalion's perimeter of
> defense in which lived the soldiers' parents, wives, and children** gradually became a familiar sight
> and a way of life."

**Design consequence: an ARVN position is a village.** Wives, children, grandparents, a vegetable plot
and a pig against the wire. Every tactical decision an ARVN officer makes, he makes in front of his
soldiers' children. When the position is overrun, families are overrun.

**"Desertion" mostly meant walking home. DOCUMENTED.** Rates averaged "about 120,000 per year"
(Khuyên). But the definition is the trap (Collins): "the South Vietnam government classified as
deserters those individuals with less than ninety days' service who were absent without leave **more
than six (later fifteen) days**… **It was also suspected that desertion and recruiting statistics
included some persons who had illegally transferred from one force to a more desirable one.**"

**A soldier fifteen days late back from leave was statistically a deserter.** And the Pentagon's own
analysts said what it actually was — comparing ARVN combat units at 26.6/1,000 against Popular Forces
at 3.9, OSD Systems Analysis (https://archive.org/details/DTIC_ADA051612) noted PF men could not
desert *to* anything, whereas "**There is good reason to believe that [returning home and enlisting in
the RF or PF] is done by many ARVN deserters.**" The same volume found **no statistical relationship
between ARVN KIA and ARVN desertion** — it was not battlefield terror.

**March 1975, the Bồ River line north of Huế** (Le Gro): "**The mass desertion was not motivated by fear
of the enemy but by the soldiers' overwhelming concern for the safety of their families in Hue.**"

**The counter-intuitive pattern. DOCUMENTED**, Khuyên: desertion was worst among **the Rangers**, then
infantry, paratroopers, marines; and **lowest in MR-1** — the 1st Infantry Division's region, the
division with the best combat reputation. MACV's own list of contributing factors ends with "misuse of
certain types of units (especially Ranger and Popular Forces) by higher headquarters."

**ARVN casualty reporting was broken, by the US government's own audit. DOCUMENTED**, OSD Systems
Analysis Vol. 8: "**The final verified statistics show a total of 24,265 RVNAF KIA [1968], an increase
of 48% over the 16,353 reported**." Khuyên explains from inside: "casualty reports were often filed at
least twice by battalion commanders; **the first report was a preliminary one and invariably gave lower
casualty figures for friendly troops than for the enemy.**" *(Again: section 4's failure mode, on the
allied side.)*

**Scale — ESTIMATE, state as order of magnitude.** ARVN dead ~220,000–254,000 against a 1971 population
of 17.5 million ≈ **1.26–1.45%**; US 58,220 against ~203 million ≈ **0.029%**. **Roughly forty to fifty
times the American per-capita loss.** Peak RVNAF strength 1970: **1,100,000 men out of 17.5 million
people** (Khuyên, **DOCUMENTED**). The specific figure 254,256 is **UNVERIFIED — drop it**.

**Why they were erased — from both directions. DOCUMENTED**, Van Nguyen-Marshall, "Recovering the
History of the Losing Side," *The Newsletter* 101, IIAS Leiden, Winter 2025,
https://web.archive.org/web/20251015090023/https://www.iias.asia/the-newsletter/article/recovering-history-losing-side-historical-research-and-republic-vietnam

Hanoi's framing: "**It continues to portray South Vietnam as a puppet (ngụy) of the United States**…
**South Vietnamese are denied agency and are seen not only as puppets but traitors to the Vietnamese
nation.**" (And the primary-source clincher: Hanoi used the word itself, in English, in a formal 1979
reply to Amnesty International — "29,000 **puppet** military personnel.")

The American framing, and the methodological indictment: "**when discussed at all, historians often
dismissed South Vietnamese political and military leaders as corrupt and incompetent. Their judgments
about South Vietnam, however, often come from their readings of US official documents and American
journalistic writings.**" **The orthodox verdict on ARVN was built from American sources about
Americans' opinions of ARVN.**

**The revisionist correction is real but not settled.** Nu-Anh Trần, *Disunion* (Hawai'i, 2022), argues
Vietnamese anticommunists were themselves revolutionary — but does not whitewash: "**despite the
revolutionaries' professed commitment to democracy, none ever established a political system in which
all groups would be allowed to participate.**" Scott Laderman's summary is the tone to aim for:

> "Newspapers flourished but often faced censorship. Writers published their work yet could find
> themselves tossed in prison. Elections were contested but only certain parties could run. **It was,
> in other words, a place of contradictions.**"

**Do not present the revision as consensus.**

### 7.10 Landscape and material culture — partial, and the colour script is unresearched

**Blunt assessment: this is the weakest-covered part of the dossier.**

**Central coast seasonality — a genuinely counter-intuitive fact that will wreck a season-of-the-year
decision. DOCUMENTED**, *Scientific Reports* 10 (2020), https://doi.org/10.1038/s41598-020-73508-z:
"in some regions, such as central Vietnam, **the majority of precipitation falls outside the summer
monsoon period**… while **70% of the annual rainfall occurs during autumn**" — coinciding with peak
tropical-cyclone landfall. **A stormy, overcast central coast in September–November is correct; the
same latitude in June is not.**

**Mangrove differs by region — the most artist-useful verified result. DOCUMENTED** (UNESCO MAB pages):
**Can Gio / Rừng Sác** (75,740 ha, SE of Ho Chi Minh City) — acid-sulphate soils, *Rhizophora
apiculata*; and it is war ground by UNESCO's own text: "**Revolutionary forces made active use of the
region during the wars against France and the United States of America.**" **Western delta / Kiên
Giang** adds ***Melaleuca cajuputi* seasonally flooded forest** — pale papery bark over black acid
water. **Red River Delta (north)** is *Kandelia candel* and *Sonneratia caseolaris* — **smaller and
scrubbier on grey mudflat, not the tall southern *Rhizophora***.

**Lowland forest is a mosaic, not uniform jungle. DOCUMENTED**, Blanc, Maury-Lechon & Pascal, *Journal
of Biogeography* 27 (2000), https://doi.org/10.1046/j.1365-2699.2000.00347.x — five 1-ha plots at Cát
Tiên gave "a **mosaic of different communities**… Three plots can be considered as **secondary
forests**… plot B corresponds to a **semideciduous formation**… and plot E to an **evergreen one
dominated by dipterocarp species**."

**"Triple canopy" canopy heights: UNVERIFIED.** No Vietnam-specific stratification study was obtained.
The familiar "emergents 40–50 m / canopy 20–30 m / understorey 10–15 m" formulation **is not sourced
here**. One relevant corrective: cyclone-exposed forests show "**higher stem density and basal area,
and lower canopy heights**" (https://doi.org/10.1111/1365-2745.13039) — so a storm-exposed central
Annamite forest should read **denser and shorter** than a sheltered inland one.

**Huế — a directly usable colour system. DOCUMENTED**, https://whc.unesco.org/en/list/678/: capital
from 1802; geomancy explicit — hills "taking the role of '**a blue dragon**' to the left and '**a white
tiger**' to the right"; aligned to "the **Five Cardinal Points**… the **Five Elements**… and the **Five
Colours (yellow, white, blue, black, red)**."

**Cham towers (Mỹ Sơn) — DOCUMENTED**, https://whc.unesco.org/en/list/949/: 4th–13th centuries,
"**constructed in fired brick with stone pillars and decorated with sandstone bas-reliefs**."

**Colour and light: NOT RESEARCHED TO STANDARD. Do not ship a colour script off this dossier.**
Laterite red, the paddy greens, the silt-brown/blackwater/mirror water triad, dry-season haze and
harvest gold are all unsourced. Likewise **roof forms by region, the Central Highlands stilt longhouse
and rông communal house, Mekong stilt houses, sampan typologies and the thúng chai basket boat.** First
stop next session: the **Vietnam Museum of Ethnology, Hanoi**.

### 7.11 Photographic archives — rights status, verified

**A commercial game is a commercial use. Read these before an artist opens a reference folder.**

- **Vietnam Center & Sam Johnson Vietnam Archive, Texas Tech — reference only, not shippable.**
  https://www.vietnam.ttu.edu/general/copyright.php: materials "**may not to be used for resale or
  commercial purposes without authorization**." **DOCUMENTED.**
- **US National Archives — the workhorse. DOCUMENTED**, https://www.archives.gov/faqs/index.html:
  "**The vast majority of the digital images in the National Archives Catalog are in the public
  domain**… **For the few images that remain copyrighted, please read the instructions noted in the
  'Use Restriction(s)' field**." **Operational rule: check the `Use Restriction(s)` field on every
  record.** Signal Corps / DoD combat photography is federal and is the core of what this project
  wants.
- **Library of Congress — per item, never blanket. DOCUMENTED**: "'No known restrictions on
  publication' **means that the Library is unaware of any restrictions**… **These facts do not mean the
  image is in the public domain.**"
- **manhhai's Flickr — clears nothing, and this is the trap most teams fall into.** Flickr's terms put
  the warranty on the uploader; Creative Commons states "**You should not apply a license to material
  that you do not own or that you are not authorized to license**"
  (https://creativecommons.org/faq/). **A scanned agency photograph re-uploaded and tagged CC BY by
  someone who is not the photographer conveys nothing. Use it as a finding aid, then clear the image
  at NARA/LoC. Never ship the Flickr copy.** **DOCUMENTED.**
- **Gallica / BnF — free non-commercially, paid commercially. DOCUMENTED**: "**La réutilisation
  commerciale de ces contenus est payante et fait l'objet d'une licence.**" Budget for it.
- **ECPAD — permission-first**, and note **droit moral is perpetual in France**, so photographer
  attribution survives expiry of economic rights. **DOCUMENTED.**
- ***Another Vietnam: Pictures of the War from the Other Side*** (National Geographic, 2002) is
  precisely the "keep the other side human" corpus — **but it is rights-reserved, held by Vietnamese
  photographers and their families. Do not assume NARA-style freedom because the war is the subject.**

### 7.12 Aftermath

**Unexploded ordnance — DOCUMENTED**, VNMAC, https://vnmac.gov.vn/en/tin-tuc/statistics-of-uxo-contamination-in-vietnam.t-61.html:
"about **800,000 tons of UXO remain uncleared**… **nearly 6.1 million hectares contaminated and
possibly contaminated with UXO, accounting for 18.71% of the country's total area**." Of 11,134
communes surveyed, **9,116 were found contaminated**. CRS gives the more defensible range: "between 6.1
and 6.6 million hectares… or **19% to 21% of the nation**"
(https://www.everycrsreport.com/reports/R45749.html). Clearance arithmetic: **40,000–50,000 ha/year →
~100 years**.

**A Vietnam-specific dud rate: UNVERIFIED. The circulating 10–30% figure is Laos-derived. Do not state
a dud rate.**

**Post-1975 casualties — CONTESTED, and the two figures are not independent:** VNMAC's "more than
**40,000** killed and **60,000** injured" and the Landmine Monitor's "**38,978 killed and 66,093
injured**" (1975–2017) should not be presented as mutual confirmation. **What is solid is the trend** —
from thousands annually in the late 1970s to "eight deaths and six injured" in 2017.

**Quảng Trị — and a correction worth carrying.** The old claim of "over 80 percent of land contaminated"
has been superseded by an evidence-based survey identifying **51,000 hectares of confirmed hazardous
area**, with Project RENEW's current figure ~**40%** (https://landmines.org.vn/where-we-work/). **The
drop from 80% to 40% is a measurement artefact — "suspected" versus "confirmed" hazardous area — and
that distinction is itself a good detail** for a project with this dossier's preoccupations.

**Agent Orange — the definitive dataset. DOCUMENTED, read directly:** Stellman et al., "The extent and
patterns of usage of Agent Orange and other herbicides in Vietnam," *Nature* 422:681–687 (2003),
https://doi.org/10.1038/nature01537:

- **Volume: 77,131,907 litres** sprayed 1961–71. "About 65% of the herbicides contained 2,4,5-T, which
  was contaminated with varying levels of TCDD."
- **Area: 2,631,297 ha** — but this is a sum across repeat-spray categories: 368,556 ha once, 369,844
  twice, … **293,461 ha sprayed ten or more times.**
- **Dioxin: 366 kg TCDD** revised total.
- **Population directly sprayed: "at least 2.1 million but perhaps as many as 4.8 million people would
  have been present during the spraying."** **This is presence during a spray mission — not exposure
  dose and not health harm.**
- **Crop destruction was an explicit purpose** from the start.
- **The origin of today's hotspots, in one sentence:** "**Approximately two litres of herbicide residue
  remains in the 208-litre barrel after it has been 'emptied'**… Barrel residues had led to inadvertent
  defoliation… near USAF airbases." **The residual dioxin problem is a base-logistics legacy, not a
  defoliation legacy.**

**What the National Academies actually concluded — and the line that must not be blurred. DOCUMENTED**,
*Veterans and Agent Orange: Update 11* (2018),
https://www.nationalacademies.org/read/25137/chapter/2: "**the distinctions among categories are based
on statistical association and not on strict causality.**" Three precision points: these findings
concern largely **US veterans**, not Vietnamese civilians; "sufficient evidence of an association" is
statistical, explicitly not causal; and the multi-generational birth-defect claims that dominate
popular coverage sit in **inadequate/insufficient evidence** — spina bifida is the only birth defect
ever placed higher. **Stating this is not a denial that harm occurred.** Stellman supplies the reason:
"**no large-scale epidemiological study of herbicides and the health of either the Vietnamese
population or war veterans has been carried out.**"

**The honest formulation on victim numbers — CONTESTED:** *Vietnam recognises roughly 3 million people
as Agent Orange victims and cites up to 4.8 million as exposed; the exposure figure derives from a
hamlet-presence calculation not intended as a health estimate, and the victim figure rests on unaudited
domestic registration. No large-scale epidemiological study of the Vietnamese population has ever been
conducted. Both the claim and the doubt are consequences of the same absence.*

**Craters — DOCUMENTED**, Westing: "The craters which were produced in South Vietnam have a combined
surface area of about **148,000 hectares** (and thus almost **1 percent of the total land surface**)."
Many persist as permanent ponds now used for fish and duck rearing.

**A design note worth carrying:** the postwar landscape is not a single story. Herbicide destroyed the
mangrove; **aquaculture prevented its return**; deliberate twenty-year replanting brought part of it
back (Can Gio: "some **21,400 of the original 40,000 ha** of mangroves were rehabilitated" 1978–1999,
FAO *Unasylva* 207). **The war's signature is legible but entangled with everything that came after.
That is truer and more interesting than a ruin.**

### 7.13 Memory in Vietnam today

**Vocabulary.** Officially *Kháng chiến chống Mỹ, cứu nước* — the **Resistance War Against America to
Save the Nation**; colloquially the **American War**. The dead of the winning side are ***liệt sĩ* —
martyrs** — and that is a **legal category conferring state benefits**, not a rhetorical flourish.

**Vietnam's own missing — DOCUMENTED against a US government primary source**, USAID FY25 Vietnam
Wartime Accounting Initiative grant notice: "It is estimated that Vietnam has between **200,000–300,000
missing** Vietnamese missing persons as a result of hostilities."

**The asymmetry is the story:** the United States spent decades and enormous resources recovering
~1,600 of its own missing; Vietnam's missing outnumber them by more than a hundredfold.

**Why this is not archival housekeeping — the cosmology, and it is load-bearing.** Heonik Kwon, *Ghosts
of War in Vietnam* (Cambridge), studies "the wandering souls of the war dead" and argues they "play an
important part in postwar Vietnamese historical narrative and imagination." In Vietnamese practice a
person who dies away from home, violently, without proper burial or the correct rite, becomes a ***cô
hồn*** — a wandering, hungry ghost, unhoused in the ancestral system.

**200,000–300,000 missing means 200,000–300,000 families holding an unresolvable ritual obligation.
Read that against §7.6 — the concrete tomb in the paddy, the parcel of rice land dedicated to funding
the rites — and the two halves of this section lock together.**

**The losing dead.** The **Biên Hòa Military Cemetery**, renamed **Bình An**, held more than 16,000 ARVN
soldiers at the war's end; after 30 April 1975 it was a restricted military area for **31 years**, with
families barred and the graves derelict, until civilian control transferred in late 2006. **These
specifics are provisionally UNVERIFIED and should be sourced before use — but the structural fact is
not in doubt, and it is the sharpest single detail here: the winners' dead are *liệt sĩ* with state
pensions, national cemeteries and DNA programmes; the losers' dead spent three decades behind a
fence.**

**The contemporary view of Americans — surprising, and important for tone. DOCUMENTED** (Pew Research
Center, 2015, 2014 fieldwork — dated, check for a newer wave),
https://www.pewresearch.org/short-reads/2015/04/30/vietnamese-see-u-s-as-key-ally/: "About
three-quarters of Vietnamese (**76%**) expressed a favorable opinion of the U.S." — 18–29-year-olds:
**89%**.

**The single most important thing a Western team can be told:** in Vietnamese historical framing the
American war is **one episode in a very long series of resistances** — Chinese for a millennium,
French, Japanese, American, then China again in 1979 and in the South China Sea since. **The American
war is not the organising trauma of Vietnamese national identity that it is of American national
identity. The Vietnamese characters should not act as though this war is the centre of the world.**

### 7.14 The rule this section actually produces

The guardrail "keep the other side human" is not satisfied by giving enemy soldiers names. It is
satisfied by giving them the *specific* things §7.2 documents: **one litre of rice a day and sixty
piasters a month; a friend in a three-man cell who carried your rifle when you had malaria; a dead
uncle; not knowing what the Front was doing when you joined it; and the dead left behind because the
air attacks came after the ground attack was over.**

That material exists, it is in their own words, and it is free to read.

---

## 8. What each fact could justify — the concrete catalogue

This is the deliverable the rest of the dossier exists to serve: which documented item supports which
buildable thing. Nothing here is a design decision; it is an index from source to opportunity. Section
numbers refer back to the evidence.

### 8.1 Briefing text and mission framing

| Documented item | § | What it supports |
|---|---|---|
| "Functional Facility Category Groups", "construction directives", "Notice to Proceed" | 3.6 | Mission briefings written as work orders. A tasking screen that reads like a contract instrument, not a war story. |
| "Work in place" as a monthly dollar rate | 3.6 | A literal `WIP $/mo` readout. The campaign's progress meter is an accounting figure. |
| The armed services as "our customers" | 3.6 | Briefing voice: the player's unit is a supplier. "Our customers in-country." |
| "Here it is! Build it!" / "a lot of the designs were what we would call 20 percenters" | 3.6 | Briefings that admit incompleteness in passing and proceed anyway. |
| "Off-Continent Employment Agreement" | 3.6 | The paperwork a contractor character signs. A real form name. |
| SLAM — Seeking, Locating, Annihilating, Monitoring, sitting in a glossary of funding terms | 3.6 | One operation name that says the quiet part, unremarked, among a dozen that don't. This is the *Stars and Stripes* register in a single artefact. |
| Bunker's close-out speech: "construction in the cause of war has also brought construction in the cause of peace and progress" | 3.6 | End-of-campaign text. Delivered straight, no irony supplied. |
| Kirkpatrick: "relieved of the responsibility of property… then we can start closing our books" | 3.6 | The war ends as an inventory problem. |
| Pentagon Papers' own vocabulary — "limited-risk gamble", "broad commitment" | 1.4 | Strategic-layer text. Administrative, not sinister. |
| Tonkin Resolution's "all necessary measures" construction | 2.2 | If any in-game authorising document is pastiched, pastiche this. |

### 8.2 Radio traffic

| Documented item | § | What it supports |
|---|---|---|
| The full *Seven Firefights* gunship↔ground transcript | 5.6 | The Cobra mode's R/T register, verbatim in structure: strict "Over"/"Out", "That's affirm", "Negative! Negative on that!", "Say again", "belongs to you", "march it". |
| Butterfly FAC cold talk-on ("do you see the mountain?… 400 meters the other side of that rock") | 5.6 | A talk-on mechanic with no marking rocket. Terrain-feature chaining as gameplay. |
| Corrections in metres — "long, short, right, or left" | 5.6 | Correct call format. Not clock code. |
| "cleared in", "went through dry", "cleared to fire", "hold high and dry" | 5.6 | The attested clearance vocabulary. |
| The ambiguous "Roger" fratricide, and "southern edge of the napalm" heard as "up the ridge" | 5.6 | A readback-discipline mechanic where ambiguity has consequences — documented, not invented. |
| Smoke read-back procedure with plain colour names | 5.6 | Identification challenge. Note the documented colours are green/purple/violet/yellow/red. |
| Dustoff request: grid, patients by type, nature of wounds, unit freq and callsign | 5.5 | The medevac call, conversational over FM — **not** a numbered nine-line. |
| Three-tier precedence: urgent / priority / routine | 5.5 | Triage UI. Not the modern five-tier A–E. |
| LBJ and NMCC Tonkin tapes, publicly available | 2.3 | Reference audio for senior-officer register handling a confused tactical picture in real time. |

### 8.3 Contractor presence, logos and euphemism

| Documented item | § | What it supports |
|---|---|---|
| RMK-BRJ as a four-firm joint venture with a real contract number (NBy-44105) | 3.1 | Materiel markings, signage, vehicle stencils. A consortium mark, not a corporate logo. |
| Three-tier wage structure by nationality, stated in an audit document | 3.2 | The most usable single fact for depicting a contractor worksite. Three pay scales, one site, stated without comment. |
| 51,044 peak employment: 4,019 American / 5,739 TCN / 41,286 Vietnamese | 3.2 | Crowd composition on any base build. The overwhelming majority are Vietnamese. |
| Recruiting offices in Seoul and Manila | 3.2 | Third-country-national characters with documented origins. |
| GAO: "$120 million worth of materials" unaccounted for; materials "dumped… unidentified, unsegregated" | 3.4 | Environment art: depot sprawl. And a mission premise that is an inventory problem. |
| "normal management controls were virtually abandoned" | 3.4 | Briefing-screen text, quotable verbatim from a federal audit. |
| Cost-plus-award-fee, graded semi-annually by three Navy officers on "quality of work, management, performance, and cost" | 3.1 | A scoring screen that is literally a contract performance evaluation. |
| 52 employees killed, 248 injured; one captured and held to 1973 | 3.1 | Civilian contractor characters with documented stakes. |
| "LOCs (acronym for roads, or Lines of Communication)" | 3.6 | Map labelling. |
| Air America's overt board in New York with covert Agency members added | 6.4 | A front-company structure that is documented, not invented. |
| Southern Air Transport's two divisions — real charter work on one side, "certain sensitive operations" on the other | 6.4 | The deniable-airline premise, in its documented form. |
| Divestiture with a continuing-service covenant | 6.4, 6.6 | How a state-owned entity becomes a contractor without the flying stopping. The lineage device for the 2032 half. |
| "Udall Resources… will cease to exist by noon today… Olmstead does not exist" | 6.3 | An entity being sanitised in real time. Usable almost verbatim as message traffic. |
| Finding SCOPE/DESCRIPTION layout, with the munitions clause buried in the description | 6.2 | The visual format of an authorising document. |

### 8.4 Instruments, statistics and the scoring layer

| Documented item | § | What it supports |
|---|---|---|
| Asymmetric penalties on the body count | 4.1 | A reporting mechanic where over-claiming is never questioned and under-claiming is. |
| Same 70 documents, +1.8% vs −30% | 4.1 | Two in-game staff sections producing different numbers from identical inputs. |
| The crossover claim protecting the order of battle | 4.2 | Coupled metrics that cannot be corrected independently. |
| HES: 165 questions, monthly, by district advisers, aggregated by Bayes theorem into A–E | 4.3 | A pacification scoring UI with real provenance. Sweetland's Appendix A preserves all 18 original indicators verbatim with their graded statements. |
| "statistically possible for HES to measure a decline… that would appear as progress" | 4.3 | A scoring display whose buckets can invert the signal. |
| A third of district advisers scoring hamlets they had mostly not visited | 4.3 | Fog-of-war on the reporting layer, not just the map layer. |
| Truck-kill criteria: 40 mm hit = destroyed, within 10 feet = damaged | 4.4 | A kill-credit rule that is a modelling assumption dressed as an observation. |
| "if the truck kill figures proved… unrealistic, the criteria would then be changed" | 4.4 | The rule being revised to make the output plausible. |
| Users applying a private 30% discount to a number they keep publishing | 4.4 | Characters who state a figure and privately discount it, in the same breath. |
| "no quantifiable objective means… to measure total ARC LIGHT results… There are certain considerations, however, that override pure statistical analyses" | 4.4 | Two staff voices, printed side by side, both correct. |
| "Son, you're writing our own report card in this country. Why are you failing us?" | 0/1 | One line of dialogue that carries the whole reporting mechanic. |
| ARVN casualty reports filed twice, the first always understating friendly losses | 7.9 | The same mechanism on the allied side. |
| The 1968 RVNAF KIA figure revised upward 48% on verification | 7.9 | An end-of-campaign number that changes after the campaign. |

**Note the constraint that governs all of the above: ADR-0003 forbids world stylisation or narrative
from warping funnel geometry, AGL, LZ obstacle truth or any flight-critical cue.** Everything in this
subsection lives in the *reporting and scoring* layer — after the fact, in text and tables. The
instruments the player flies on stay true. That separation is not a thematic device; it is the existing
architectural rule, and it happens to be exactly the line the material wants.

### 8.5 Missions, threat and flight model

| Documented item | § | What it supports |
|---|---|---|
| Two minutes average unloading for a twelve-ship formation | 5.1 | The LZ exposure clock. The number to build the mode around. |
| Artillery → ARA (30 s, half load) → lift gunships → transports | 5.1 | The prep relay as a sequenced, timed mission phase. |
| ARA and TacAir flying perpendicular to the artillery gun-target line | 5.1 | A deconfliction mechanic with a documented rule. |
| Two-minute / five-minute ARA alert ladder | 5.1 | On-call fire support with real readiness states. |
| Enroute high → NOE several km out → LZ phase | 5.2 | The three-phase approach profile. |
| "zone of maximum vulnerability from small arms"; 1,500 ft as the standing choice | 5.2 | Threat bands with a documented rationale, not a designer's guess. |
| Assault altitude 50 ft "or lower" with four named justifying conditions | 5.2 | A risk/reward altitude choice with documented triggers. |
| 12.7 mm sited in triangles/rectangles ~1,000 m from likely LZs, redeployed daily | 5.3 | Threat placement algorithm. |
| 10–12 man teams on "every piece of critical terrain" | 5.3 | LZ ambush composition. |
| The hoist ambush — holding fire until the penetrator touches down, escort masked by friendlies | 5.5 | A scripted encounter, documented in a 1st Cav officer's own words. |
| Hoist missions seven times as dangerous; one hit per 44 trips vs one per 311 | 5.5 | Damage-model constants. |
| "if the unit's soldiers could safely stand up… the pickup zone could be reported as secure" | 5.5 | The information gap between what the ground unit reports and what the crew faces. |
| More Dustoff pilots killed in non-hostile crashes than by enemy fire | 5.5 | Weather, night and terrain carry much of the threat budget. |
| UH-1D highland load cut from seven to five troops by density altitude | 5.8 | A performance constraint that changes mission structure, from the campaign's own AAR. |
| AH-1G V_max by configuration (148.5 clean → 135.5 heavy hog) | 5.7 | Flight-model drag table. And the correction that 190 kt is structural, not achievable. |
| UH-1B V_ne clamp vs UH-1C power limit (the 540 rotor) | 5.7 | The single biggest handling difference in the Huey family. |
| XM28 turret limits, 6-second burst limiter, reticle-blink when slewing faster than the turret | 5.7 | Gunner-station behaviour, implementable as specified. |
| Pink Team = one AH-1G + one OH-6A | 5.7 | Hunter-killer pairing at the documented ratio. |
| "Good weather" = ceiling above 500 ft, slant visibility over 1.5 miles | 5.8 | A weather gate with an operational definition. |
| Crachin: 53 days/yr at Hue, 41 at Da Nang, 10 at Nha Trang | 5.8 | Regional weather modelling. |
| Central coast 70% of rainfall in autumn | 7.10 | Season selection. A stormy central coast in June is wrong. |

### 8.6 Terrain, vegetation and world-building

| Documented item | § | What it supports |
|---|---|---|
| Mekong Delta single-cropped in 1968; flood June–Feb cycle | 7.4 | The paddy state machine through a campaign year. |
| Ring-dyked triple-crop compartments are a 2000s artefact | 7.4 | **The anachronism trap.** Modern satellite reference is the wrong landscape. |
| Floating rice: tip just above the waterline, no visible field | 7.4 | A distinctive delta biome almost never depicted. |
| 2–5 cm of water over a churned surface; ankle-deep, not shin-deep | 7.5 | Paddy water rendering and character placement. |
| Fields flooded until 7–10 days before harvest | 7.5 | Harvest scenes are dry cracked crust under gold stubble, not water. |
| Nursery plot one-tenth the field area | 7.5 | The strongest colour contrast in the cycle — one saturated green square per ten brown fields. |
| 150–180 day tall traditional varieties that lodge | 7.5 | Plant silhouette. Modern semi-dwarf reference is wrong. |
| Single-blade buffalo ard that stirs and slices | 7.5 | No turned furrow slices in a 1968 field. |
| Concrete and cement tombs standing in working paddy, sized by wealth, sited by geomancy | 7.6 | The single most distinctive terrain feature available, and the one with the most weight. |
| Villages strung along levees and canal banks; flood leaves only the banks dry | 7.6 | Southern settlement geometry. |
| Nipa palm thatch; dirt floors; ancestral altar as the focal point of the main room | 7.6 | Interior and roofing materials. |
| Black cotton as a class marker; white cotton the affordable step up | 7.6 | Character costume that carries information. |
| Buffalo numbers 222,000 (1954) → 800,000 (1964) under a slaughter ban | 7.5 | A buffalo is a rebuilt capital asset, not set dressing. |
| Regional mangrove species differences | 7.10 | Northern mangrove is scrubbier and greyer than southern. |
| Lowland forest as a mosaic of secondary, semideciduous and evergreen | 7.10 | Not uniform jungle. |
| Cyclone-exposed forest reads denser and shorter | 7.10 | Regional canopy variation with a mechanism. |
| Huế's Five Colours system and blue-dragon/white-tiger siting | 7.10 | An authentic architectural colour system. |
| Cham towers: fired brick, stone pillars, sandstone bas-relief | 7.10 | Ruin construction, correctly specified. |
| Craters at ~1% of South Vietnam's land surface, many now fish and duck ponds | 7.12 | Postwar terrain that is *in use*, not ruined. |
| Can Gio mangrove replanting 1978–1999 | 7.12 | The aftermath is entangled recovery, not a frozen ruin. |

### 8.7 Characters and the other side

| Documented item | § | What it supports |
|---|---|---|
| Three tiers — guerrilla / Local Force / Main Force — plus PAVN | 7.1 | Enemy composition that changes by year and region. |
| 1965 vs 1970 are different enemies | 7.1 | Campaign structure. |
| The three-man cell as friendship, in their own words | 7.2 | Enemy squad behaviour with a documented social mechanism. |
| One litre of rice a day, eight piasters food allowance, sixty piasters a month | 7.2 | Concrete material conditions. |
| Malaria at 20–30 of 70 in six months | 7.2 | Attrition that isn't combat. |
| "the dead were left behind" because air attacks followed the ground attack | 7.2 | A behaviour the player causes and can observe. |
| The B-52 as the one weapon that frightened them | 7.2 | Documented psychological asymmetry. |
| ARVN officer/NCO/EM assignment by education decree | 7.9 | Class written into an allied character's biography, by statute. |
| Families living inside the battalion perimeter | 7.9 | **An ARVN position is a village.** The most under-used environment in the genre. |
| ARVN pay ×5 against rice ×14 | 7.9 | Why an allied soldier sells his rations. |
| "Desertion" = fifteen days late from leave; men re-enlisting nearer home | 7.9 | A statistic that means something other than what it says. |
| Bồ River 1975: desertion driven by families' safety, not fear of the enemy | 7.9 | Character motivation, documented. |
| *cô hồn* — the unhoused dead — and 200,000–300,000 missing | 7.13 | The aftermath beat with the deepest documented grounding. |
| Bình An cemetery behind a fence for 31 years | 7.13 | The asymmetry between the winners' dead and the losers' dead. |
| 76% Vietnamese favourability toward the US (2014) | 7.13 | Tone check. The war is not the centre of the Vietnamese world. |

### 8.8 The aftermath beats

ADR-0003's *ma* — quiet aftermath — has more documented material available than any other beat in this
dossier, and none of it needs invention:

- Fly back over a paddy with concrete tombs in it (7.6).
- A crater in use as a fish pond (7.12).
- Mangrove replanted over twenty years, in even-aged uniform stands that read as unnatural (7.10, 7.12).
- A base perimeter with a vegetable plot and a pig against the wire (7.9).
- A depot of unidentified, unsegregated materiel (3.4).
- Clearance arithmetic: 40,000–50,000 ha a year, about a hundred years to go (7.12).
- Two litres of residue left in each "empty" 208-litre barrel — the reason the hotspots are at airbases,
  not in the defoliated forest (7.12).
## 9. Naming real people and companies — a recommendation for the 2032 half

This is the owner's call. The argument is set out here so it is in front of him.

**Recommendation: name the historical freely; use clearly recognisable fictional analogues for
living people and active companies.**

The historical half is documented history, decades old, in the public record, and much of it is
US-government-published (every source in sections 1–5 of this document is a government archive, a
federal publication, a university press or a named contemporary periodical). Naming Johnson,
McNamara, Ellsberg, Westmoreland, Brown & Root and RMK-BRJ is not a risk and is not a choice — it is
what the material *is*. Fictionalising the historical half would be the strange decision.

The 2032 half is different, for three reasons in descending order of weight.

**1. It is better art.** Roman-à-clef is the standard form for political fiction because the reader
does the work. Invented names let you write the character the scene needs rather than the character
the real person's public record forces on you, and they free the writing from constant
fact-checking against a moving target. This also fits the deadpan register the owner has asked for:
a fictional contractor with a cheerfully bland name and a real-sounding contract vehicle is funnier
and colder than a named one, because the joke is the form, not the target. *Porco Rosso* never names
Mussolini; ADR-0003 already names Ghibli's aviation register as the tone target.

**2. It ages.** A 2032 scenario pinned to specific named living figures is dated the moment reality
diverges from it, and reality will diverge. Analogues stay readable. The game is intended to have a
long arc (guns-only → air littoral → medical sim); content that expires in eighteen months is
expensive content.

**3. It removes an exposure.** Depicting named living people committing atrocities in a distributed
commercial product is a real legal risk. US law gives public figures a high bar — actual malice,
*New York Times Co. v. Sullivan*, 376 U.S. 254 (1964) — and fiction cases add an "of and concerning"
requirement, but the project ships internationally, and other jurisdictions are markedly less
protective. This is not legal advice and should not be treated as any; it is a reason to prefer the
cheaper option when the cheaper option is also the better one. Named *companies* carry a separate
and less forgiving set of trade-libel and trademark questions, and ADR-0003 already bars IP copying.

**The structural move that gets the value without the cost:** give the fictional 2032 contractor an
explicit documented lineage to the real historical one. The historical half names Brown & Root and
RMK-BRJ, with real contract vehicles and real numbers. The 2032 half's contractor has a corporate
history page in-fiction that traces back to it. The reader connects the two without the game
asserting anything. Same valley, same contracting mechanism, better cameras.

**Where I would break the rule:** real *institutions of state* that outlive individuals — the
Department of Defense, NAVFAC, MACV's successor structures, the CIA — should keep their real names
in both halves. They are not people, they persist, and swapping them for invented acronyms costs
authenticity for no benefit. The line is: **real institutions, real history, invented firms and
invented officeholders.**

Everything generated or speculative continues to carry the project's `fiction` label with
provenance, per ADR-0003 item 4.


---


## 10. Do-not-invent list

Things that are documented, that a designer would otherwise be tempted to make up, and that we should
get right because getting them right is free and getting them wrong is conspicuous.

### 10.1 Names and designations that are real — use as-is

| Item | Correct form | § |
|---|---|---|
| The Pentagon Papers' official title | *Report of the Office of the Secretary of Defense Vietnam Task Force* | 1.1 |
| The JCS office running covert operations against the North from Feb 1964 | Office of the Special Assistant for Counterinsurgency and Special Activities | 2.4 |
| The construction consortium | RMK-BRJ — Raymond International, Morrison-Knudsen, Brown & Root, J. A. Jones | 3.1 |
| Its contract | NBy-44105, under OICC RVN / NAVFAC (BUDOCKS before 1966), under MACV | 3.1 |
| The White House leak unit | "the Plumbers" | 1.5 |
| Roads, in official usage | LOCs — Lines of Communication | 3.6 |
| The unit of construction accounting | "work in place" (WIP) | 3.6 |
| Covert action, in statute | "special activities" (E.O. 12333 §3.4(h)); Hughes-Ryan defines it only negatively | 6.1 |
| Slow FAC callsigns | Nail (23d TASS), Covey (20th TASS), Raven (Udorn), Rustic (Cambodia), Misty (F-100F fast FAC), Butterfly (Laos, no marking rockets) | 5.6 |
| Hunter-killer team | Pink Team = **one** AH-1G + **one** OH-6A | 5.7 |
| The medevac callsign's origin | Maj. Lloyd Spencer, mid-1963, from an SOI list — **not** Kelly's, and **not** universal (1st Cav used "Medevac", 101st "Eagle Dust Off") | 5.5 |

### 10.2 Facts to keep straight

- **The 2 August 1964 engagement happened. The 4 August one did not.** Do not collapse them, and do
  not write the 2 August action as fictitious. (2.3)
- **The Tonkin Gulf Resolution is not a declaration of war.** (2.2)
- **McNamara commissioned the Pentagon Papers.** Not a whistleblower project. (1.1)
- **Ellsberg was an insider who helped plan the 1965 ground deployment.** (1.2)
- **The Papers were published June 1971; the war ran to 1973/1975**, and majority US opinion had
  already turned in August 1968. (1.6)
- **RMK-BRJ was RMK first.** Brown & Root and J. A. Jones joined on **3 August 1965**, on the
  contractor's own recommendation, approved by the Navy. (3.1)
- **RMK-BRJ was the first US use of civilian contractors in an active combat zone.** (3.1)
- **SNIE 14.3-67 was negotiated down to match the public line** — it is not the honest internal
  document behind a dishonest public one. (4.2)
- **The 9-line MEDEVAC request did not exist in Vietnam.** Nor did the 9-line CAS brief. Both are late-
  1980s standardisations. (5.5, 5.6)
- **190 kt is the AH-1G's structural limit, not achievable level flight** (~135–148 KTAS by config). (5.7)
- **Five troops per UH-1D in the highlands, not six.** (5.8)
- **Southern Air Transport was not CIA-owned in 1986** — sold in 1973. The Hasenfus C-123 was an
  Enterprise aircraft "connected to" SAT, not operated by it. (6.4)
- **The Mekong Delta of 1968 was single-cropped.** The ring-dyked triple-crop grid is a 2000s
  engineering artefact — modern satellite imagery is the wrong landscape. (7.4)
- **A 1968 rice crop is a tall 150–180 day variety that lodges**, not a modern semi-dwarf. (7.5)
- **An ARVN position has soldiers' families living in it.** (7.9)
- **ARVN "desertion" statistics counted men fifteen days late from leave**, and many "deserters"
  re-enlisted in local forces nearer home. (7.9)

### 10.3 Frequently repeated, and NOT substantiated — do not use

**The Ellsberg/Tonkin cluster**
- Attribution of the pre-drafted Tonkin resolution specifically to **William P. Bundy**. Widely stated;
  no primary document found. (2.4)
- Wording and date of Johnson's 1964 "American boys… what Asian boys ought to be doing for themselves"
  line. Almost certainly real; no authoritative text reached. **Verify against the Public Papers of the
  Presidents.** (10.4)
- The 1970 Senate repeal vote (81–10, 24 June 1970) and the 12 January 1971 signature: secondary
  sources only. (2.4)
- The origin of "credibility gap" (David Wise, *New York Herald Tribune*, 1965): popular sources only.

**The contractor cluster**
- **"$1.9 billion" as the RMK-BRJ total.** Not in either primary document. Use $823m authorized at
  1 Oct 1966 (GAO), or "more than $2 billion for the whole US construction effort" (NAVFAC). (3.2)
- **Rumsfeld's "illegal by statute" and "President's Club" charges.** Unverifiable. Use the GAO finding
  on 10 U.S.C. 2306(a) instead — it is stronger and citable. (3.4)
- **"Burn & Loot"** as a GI nickname. No period source. (3.4)
- **Any documentary link between LBJ personally and the RMK-BRJ award or expansion.** The primary
  record affirmatively points elsewhere. (3.3)
- **Any official-source derivation of LOGCAP from RMK-BRJ.** The corporate through-line is documentable
  from SEC filings; the institutional claim is journalistic. (3.5)
- The Halliburton purchase price ($32.6m / $36.8m / $33.5m all circulate). (3.5)

**The measurement cluster**
- **"The McNamara fallacy" as something McNamara said.** REFUTED — traceable to Charles Handy (1994),
  who also misspelled the name. The four steps are Daniel Yankelovich's, from "The New Odds",
  15 October 1971, and they were coined **about Vietnam**. (4.6)
- The usual citation to Yankelovich, "Corporate Priorities" (1972) — a citation-merge artefact. (4.6)
- **The "mere gook rule"** — provenance not established at all. (4.1)
- MACV's actual counting directives; Westmoreland's own statements on the body count. (4.1)
- Everything about *Westmoreland v. CBS* except that the 1984 trial happened and who testified. (4.2)
- **~7–8 million tons total US bomb tonnage in Southeast Asia; ~643,000 tons for ROLLING THUNDER.** No
  citable primary source found. (4.4)
- Strathern's "when a measure becomes a target, it ceases to be a good measure" — sentence and page
  unconfirmed. Goodhart's law: wording documented, citation unresolved between two 1975 papers. (4.6)

**The air-war cluster**
- **"Cleared hot"**, **"hit my smoke"**, **"in hot"**, **"FAC in"**, **"off dry"/"off wet"**, **"Willie
  Pete"**, **"goofy grape"/"lemon yellow"** — **zero attestation in any 1961–73 document searched.**
  Use the Grade-A vocabulary in 5.6, which is more distinctive than the clichés. *(The original brief
  for this dossier used "Willie Pete" — a good illustration of how the clichés propagate.)*
- The **"5,086 destroyed; 2,382 combat / 2,704 operational"** helicopter loss split. (5.4)
- Total Dustoff aircraft lost for the war; Pink Team element altitudes; the "Breeze Model 100" hoist
  designation; a stopwatch figure for hoist extraction under fire; the exact first SA-7 launch. (5)
- "M28 gun pod" — a conflation of the M18 pod and the M28 turret. (5.7)
- The AH-1G's arrival as "Bien Hoa, 29 Aug 1967" — CMH says **1 September 1967**. (5.7)

**The covert-action cluster**
- **"Termination with extreme prejudice."** Zero hits across Church Book I, the Church assassination
  report, and the entire Iran-Contra report. An entire Senate report on CIA assassination does not
  contain the phrase. State it as "not present in the primary investigative record." (6.5)
- **"Non-official cover" / NOC** for the period. "Official cover" and "deep cover" *are* attested. (6.5)
- **"The off-the-shelf, self-sustaining, stand-alone entity"** as a verbatim quotation — that exact
  string is nowhere in the congressional report, and the underlying claim is disputed within the
  official record by Casey's own two deputies. (6.3)
- "Boards of cleared attorneys" — the report's words are "nominee stockholders, directors, and
  officers", "legal straw men", "cleared and witting". (6.4)
- NSC 10/2 (1948) as the origin of "plausibly disclaimed" — not retrieved. (6.1)
- Any claim about modern contractor aviation — that leg is unbuilt. (6.6)

**The Vietnamese cluster**
- **Đặng Thùy Trâm's diary must not be quoted without a licence.** The family had the English text
  withdrawn from the Texas Tech archive. Popular quotations are unverified against the published
  translation. (7.3)
- A Vietnam-specific **UXO dud rate**. The circulating 10–30% is Laos-derived. (7.12)
- Quảng Trị "over 80% contaminated" — superseded by ~40% / 51,000 ha confirmed. (7.12)
- **"3 million Agent Orange victims" or "4.8 million exposed" stated as findings.** 4.8 million is the
  upper bound of a hamlet-presence calculation not intended as a health estimate. (7.12)
- Multi-generational Agent Orange birth defects as established. Only spina bifida has ever been placed
  above "inadequate/insufficient evidence", and those findings concern US veterans. (7.12)
- ARVN dead as **254,256**. Use ~220,000–254,000 as a range. (7.9)
- The claim that Vietnam abandoned *ngụy* in official history in 2017 — contradicted by 2025
  scholarship. (7.9)
- Red River Delta cropping calendar and the chiêm/mùa vocabulary; "triple canopy" canopy heights;
  Rome-plow hectares; Vietnamese dyes, nón lá construction, đòn gánh, sampan and thúng chai typologies;
  the rông communal house and Central Highlands longhouse. **All NOT RESEARCHED TO STANDARD.** (7.5, 7.10)
- **Any colour script.** Genuinely unresearched. (7.10)

### 10.4 Rights, not facts — read before an artist opens a reference folder

A commercial game is a commercial use.

- **Texas Tech's Virtual Vietnam Archive: reference only.** "may not to be used for resale or
  commercial purposes without authorization."
- **NARA is the workhorse** — but check the `Use Restriction(s)` field on **every** record.
- **Library of Congress: per item.** "No known restrictions" does not mean public domain.
- **manhhai's Flickr clears nothing.** A scanned agency photograph re-uploaded and tagged CC BY by
  someone who is not the photographer conveys no licence. Finding aid only; clear at NARA/LoC.
- **Gallica: free non-commercially, paid commercially.** ECPAD: permission first, and French *droit
  moral* is perpetual.
- ***Another Vietnam*** (National Geographic, 2002) is exactly the "other side" corpus and is
  **rights-reserved**, held by Vietnamese photographers and their families.

All of this is in 7.11 with the licence text quoted verbatim.

---

## 11. Documented / contested / ours

### Documented — build freely
Everything labelled **DOCUMENTED** above: dates, official titles, organisational names, court
outcomes, contract structures, poll series, aircraft performance figures, unit facts, radio
phraseology graded A, and published quotations. Where a document is OCR'd from a scan, spot-check the
quotation against page images before it reaches a player-facing screen.

### Contested — carry the ambiguity or leave it out
- Whether the Tonkin SIGINT handling was deliberate deception or rationalisation. (2.3)
- The causal weight of the Pentagon Papers in the 1973 congressional restrictions. (1.6)
- Whether Casey ever wanted an off-the-shelf covert capability — believed by the Iran-Contra majority,
  denied by his two deputies, and he died before testifying. (6.3)
- How much blame McNamara's methods deserve: Gibson and Krepinevich versus Daddis. Note the genuine
  convergence — Daddis and Thayer agree on the mechanism (collection displaced analysis) and disagree
  about the blame. (4.5)
- Whether HES's Tet failure was a real failure or a category error. Sweetland argues the latter. (4.3)
- Vietnamese war deaths: ~966,000 (1995 demographic, acknowledged downward bias) to 3.81 million
  1955–2002 (2008 survey, CI 2.21–5.94M, built on 290 observed deaths). (7.8)
- ARVN dead, re-education camp numbers, UXO casualty figures, Agent Orange victim counts. (7.9, 7.12)
- Whether the revisionist rehabilitation of the RVN is right. It is live, not settled. (7.9)

**Design rule for contested items: they can be texture** — a character asserts one side, another
shrugs — **but they cannot be fact.** No briefing screen, no statistic, no loading tip.

### Ours — invention, labelled as such
- Every 2032-era company, agency, officeholder, operation name and logo. (9)
- Every callsign, mission name and unit not attested in sections 3, 5 or 8.
- All narrative characters.
- Any generated reference imagery, per ADR-0003 item 4 — carrying provenance and the `fiction` label.

The line: **real institutions, real history, invented firms and invented officeholders.**

### What this dossier does not cover
- The 2032 half beyond the naming question in section 9.
- Modern contractor aviation (6.6).
- The Brown–Johnson relationship to the standard of the rest of the document (3.3).
- Colour, light, vernacular architecture and boats for the art team (7.10).
- The Red River Delta agricultural year (7.4).

Each is flagged in place. None should be filled from memory.
