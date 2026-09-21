import {
  ArrowRightIcon,
  ClockIcon,
  EyeIcon,
  LockKeyIcon,
  NotePencilIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";

const capabilities = [
  {
    icon: NotePencilIcon,
    title: "A place for everyday care",
    description:
      "Find a patient, choose a visit, and record observations. Keep the hospital’s own care history together.",
  },
  {
    icon: UsersThreeIcon,
    title: "Sharing with patient choice",
    description:
      "Ask for the records needed for treatment. Patients can review the request, choose what to share, and withdraw access.",
  },
  {
    icon: EyeIcon,
    title: "Accountability you can follow",
    description:
      "Review who accessed records and why. Give security teams a clear path to investigate unusual activity.",
  },
];
const questions = [
  {
    question: "Do we need to replace our hospital software?",
    answer:
      "RecordShield is designed for two paths: an adapter connects a hospital’s existing electronic medical record, while RecordShield’s lightweight EMR supports facilities starting without one. The current preview demonstrates both paths with simulated hospital systems.",
  },
  {
    question: "Who decides which records a clinician can see?",
    answer:
      "Access is evaluated using the clinician’s identity, role, shift, care assignment and the records requested. Routine sharing between hospitals also requires the patient’s scoped approval. Being signed in does not grant access to every patient.",
  },
  {
    question: "What happens in an emergency?",
    answer:
      "An eligible clinician can request a time-limited emergency summary. Access to additional records requires a separate justification, and specially protected information remains controlled. Emergency access is recorded and requires a follow-up clinical review.",
  },
  {
    question: "Can another hospital change our records?",
    answer:
      "Shared records are read-only. A receiving hospital documents its own care in its own visit, while the original records remain with the originating facility.",
  },
  {
    question: "Can we use the preview for real patient care?",
    answer:
      "The current product is a working frontend preview backed by a simulated API and fictional data. Real hospital use requires backend integration, identity verification and operational validation. Please use only the supplied sample accounts and fictional information.",
  },
];

export function ProductSections() {
  return (
    <>
      <section id="product" className="scroll-mt-8 border-y border-border/70 bg-card/65">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="grid gap-5 md:grid-cols-2 md:gap-16">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              From the first visit to the next hospital
            </p>
            <div>
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Better continuity.
                <br />
                Clearer responsibility.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
                Care doesn’t stop at a hospital’s front door. RecordShield brings local
                documentation, controlled sharing, and access oversight into one product.
              </p>
            </div>
          </div>
          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {capabilities.map(({ icon: Icon, title, description }, index) => (
              <article key={title} className="border-t border-border pt-6">
                <div className="flex items-center justify-between">
                  <Icon aria-hidden="true" size={28} weight="duotone" className="text-primary" />
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section
        id="how-it-works"
        className="mx-auto grid max-w-7xl scroll-mt-8 gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-24 lg:px-12 lg:py-24"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            A request with a reason
          </p>
          <h2 className="mt-5 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            The records needed.
            <br />
            The permission to use them.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            Make sharing understandable for the person receiving care and the team providing it.
          </p>
          <div className="mt-8 flex items-start gap-3 rounded-xl bg-secondary/60 p-5">
            <LockKeyIcon aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            <p className="text-sm leading-6 text-primary">
              Permission has a purpose, a scope, and an expiry. Patients can stop future access when
              their choices change.
            </p>
          </div>
        </div>
        <ol className="space-y-0">
          {[
            {
              title: "The clinician asks",
              text: "Choose the hospital, the records needed, and the reason for the request.",
            },
            {
              title: "The patient chooses",
              text: "See who is asking and why. Approve selected records for a limited time, or decline.",
            },
            {
              title: "The care team reviews",
              text: "Read the approved information with its source clearly shown. Each access leaves a record.",
            },
          ].map((step, index) => (
            <li
              key={step.title}
              className="flex gap-5 border-b border-border py-7 first:pt-0 last:border-b-0"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/25 font-mono text-xs text-primary">
                0{index + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.2fr_1fr] lg:gap-24 lg:px-12 lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">
              When care can’t wait
            </p>
            <h2 className="mt-5 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Urgency needs access.
              <br />
              It still needs accountability.
            </h2>
          </div>
          <div className="space-y-5">
            <p className="text-base leading-7 text-primary-foreground/85">
              Emergency access starts with a focused summary. Additional information requires
              justification, and every emergency session carries a review obligation.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <span className="inline-flex items-center gap-2">
                <ClockIcon aria-hidden="true" />
                Time-limited
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheckIcon aria-hidden="true" />
                Patient-specific
              </span>
              <span className="inline-flex items-center gap-2">
                <EyeIcon aria-hidden="true" />
                Reviewable
              </span>
            </div>
            <a
              href="#questions"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4"
            >
              Understand the safeguards <ArrowRightIcon aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
      <section
        id="questions"
        className="mx-auto grid max-w-7xl scroll-mt-8 gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24 lg:px-12 lg:py-24"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            A few useful answers
          </p>
          <h2 className="mt-5 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Built on clear
            <br />
            expectations.
          </h2>
        </div>
        <div>
          {questions.map(({ question, answer }) => (
            <details key={question} className="group border-b border-border first:border-t">
              <summary className="cursor-pointer py-6 pr-3 text-base font-medium marker:text-primary">
                {question}
              </summary>
              <p className="max-w-2xl pb-6 text-sm leading-7 text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
