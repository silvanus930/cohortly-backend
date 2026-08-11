import { type Assignment, type RubricCriterion } from './entities/assignment.entity';
import { type RubricScore, type Submission } from './entities/submission.entity';
import { type SubmissionStatus, type SubmissionType } from './enums/assignment.enums';

export interface AssignmentDto {
  id: string;
  lessonId: string;
  courseId: string;
  title: string;
  instructions: string;
  submissionType: SubmissionType;
  maxPoints: number;
  passingPoints: number;
  rubric: RubricCriterion[];
  allowResubmission: boolean;
  maxSubmissions: number;
}

export interface SubmissionDto {
  id: string;
  assignmentId: string;
  attemptNumber: number;
  text: string | null;
  fileUrl: string | null;
  status: SubmissionStatus;
  score: number | null;
  rubricScores: RubricScore[];
  feedback: string | null;
  gradedAt: Date | null;
  submittedAt: Date;
  learner?: { id: string; fullName: string; email: string; avatarUrl: string | null };
}

export function toAssignmentDto(assignment: Assignment): AssignmentDto {
  return {
    id: assignment.id,
    lessonId: assignment.lessonId,
    courseId: assignment.courseId,
    title: assignment.title,
    instructions: assignment.instructions,
    submissionType: assignment.submissionType,
    maxPoints: assignment.maxPoints,
    passingPoints: assignment.passingPoints,
    rubric: assignment.rubric,
    allowResubmission: assignment.allowResubmission,
    maxSubmissions: assignment.maxSubmissions,
  };
}

export function toSubmissionDto(submission: Submission, withLearner = false): SubmissionDto {
  const dto: SubmissionDto = {
    id: submission.id,
    assignmentId: submission.assignmentId,
    attemptNumber: submission.attemptNumber,
    text: submission.text,
    fileUrl: submission.fileUrl,
    status: submission.status,
    score: submission.score,
    rubricScores: submission.rubricScores,
    feedback: submission.feedback,
    gradedAt: submission.gradedAt,
    submittedAt: submission.submittedAt,
  };
  if (withLearner && submission.user) {
    dto.learner = {
      id: submission.user.id,
      fullName: `${submission.user.firstName} ${submission.user.lastName}`.trim(),
      email: submission.user.email,
      avatarUrl: submission.user.avatarUrl,
    };
  }
  return dto;
}
