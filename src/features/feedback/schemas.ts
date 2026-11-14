import { z } from "zod";

export const submitFeedbackSchema = z.object({
  rating: z
    .number()
    .int("Rating must be a whole number")
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5"),
  message: z
    .string()
    .trim()
    .min(1, "Please enter your feedback")
    .max(2000, "Feedback message must be at most 2000 characters"),
  page: z
    .string()
    .trim()
    .min(1, "Page path is required")
    .max(160, "Page path is too long"),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

export interface FeedbackSummaryDto {
  id: string;
  page: string;
  rating: number;
  message: string;
  createdAt: string;
}

export class FeedbackServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "FeedbackServiceError";
    this.statusCode = statusCode;
  }
}
