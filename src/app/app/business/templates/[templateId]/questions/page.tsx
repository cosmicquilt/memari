// memari. for businesses - a template's questions for its clients (intake
// that fills the book, 2026-10-31; src/lib/templateQuestions.ts): every
// module of the template a client could fill, and which are asked.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/business";
import { questionCandidates } from "@/lib/templateQuestions";
import { QUESTIONS_MAX } from "@/lib/clientAnswers";
import { QuestionPicker } from "../../../Answers";
import css from "../../../business.module.css";

export default async function TemplateQuestionsPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { owner } = await requireBusiness();
  const { templateId } = await params;
  const found = await questionCandidates(owner.id, templateId).catch(() => null);
  if (!found) notFound();
  const { title, questions, candidates } = found;
  return (
    <>
      <div className={css.head}>
        <h1>Questions for clients</h1>
        <Link href="/app/business/templates" className={css.btn}>
          Back to templates
        </Link>
      </div>
      <p className={css.dim} style={{ maxWidth: 680 }}>
        On {title}. Each client answers on their own page, and their answer prints in the module you ask about, in place of what it prints now: their goals in your goals
        list, their why in your text. Until they answer, it prints as it is. {questions.length} of up to {QUESTIONS_MAX} asked.
      </p>
      <div className={css.card}>
        <h2>What a client could fill in</h2>
        {candidates.length === 0 ? (
          <p className={css.dim}>
            Nothing on this template takes writing yet. Add a text, a list or a habit tracker to one of its pages in the editor, and it shows here.
          </p>
        ) : (
          <div className={css.steps}>
            {candidates.map((c) => (
              <QuestionPicker key={c.moduleId} templateId={templateId} candidate={c} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
