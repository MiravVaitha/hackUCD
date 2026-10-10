/** Free, local extraction. Missing facts stay blank and every result needs review. */
export function parseDeliveryEmail(raw: string) {
  const text = raw.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ");
  const capture = (pattern: RegExp) => pattern.exec(text)?.[1]?.trim() ?? "";
  const carrier = capture(/\b(DHL|DPD|UPS|FedEx|An Post|Royal Mail|Evri|GLS)\b/i);
  const tracking = capture(/\btracking\s*(?:number|no\.?|id|reference|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{5,39})\b/i);
  const orderNumber = capture(/\border\s*(?:number|no\.?|id|reference|#)?\s*[:#-]?\s*([A-Z0-9]+-[A-Z0-9-]+|\d{3,20})\b/i).toUpperCase();
  // Negation wins over a bare 'delivered' word; status lines win over email history.
  const statusLine = capture(/^\s*(?:delivery )?status\s*:\s*([^\r\n]+)/im);
  const statusText = statusLine || text;
  const status = /not delivered|undelivered|delivery failed|failed delivery|delivery attempt|exception|delayed/i.test(statusText) ? "exception"
    : /out for delivery/i.test(statusText) ? "out_for_delivery"
    : /has been delivered|was delivered|successfully delivered|^delivered\b/i.test(statusText) ? "delivered"
    : /in transit|dispatched|shipped/i.test(statusText) ? "in_transit" : "unknown";
  const reportedDate = capture(/(?:delivered (?:on|at)|delivery date|estimated delivery|expected delivery|date)\s*:\s*([^\r\n]{1,100})/i);
  return { carrier, tracking, orderNumber, status, reportedDate };
}
