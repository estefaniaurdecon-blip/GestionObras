export type LinkedWorkReportUser = {
  id: number;
  full_name: string;
  email: string;
};

export function keepLinkedWorkReportUserForText(
  nextText: string,
  linkedUser: LinkedWorkReportUser | null,
): LinkedWorkReportUser | null {
  if (!linkedUser) return null;
  const normalizedText = nextText.trim();
  const linkedName = linkedUser.full_name.trim();
  if (!normalizedText || normalizedText !== linkedName) {
    return null;
  }
  return linkedUser;
}
