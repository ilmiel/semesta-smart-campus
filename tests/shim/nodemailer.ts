const nodemailer = { createTransport() { return { async sendMail() { return {}; } }; } };
export type Transporter = { sendMail(m: unknown): Promise<unknown> };
export default nodemailer;
