# Privacy Policy

**Last updated:** April 27, 2026

> This text is provided for convenience and does not constitute legal advice. Instance operators should have policy and hosting practices reviewed for their jurisdiction.

This Privacy Policy describes how personal data is processed when you use **friendflow**, a self-hosted web application for groups (the “Service”). friendflow is typically installed and operated by an independent person or organisation (“**instance operator**”, “**we**” or “**us**” in this policy when referring to whoever runs *your* deployment).

Because friendflow is **self-hosted**, the identity of the controller and contact details depend on **who operates the server you are using**. If you use an instance run by someone else, that operator is responsible for answering questions about your data.

---

## 1. Scope

This policy applies to use of the friendflow software connected to your browser or device. It does not govern third-party websites linked from the Service.

---

## 2. Roles

- **Instance operator:** The party that installs friendflow, configures the server, and decides registration rules, backups, and integrations.
- **Users:** People who create an account (where registration is enabled) or are invited into groups on that instance.

---

## 3. Data we process

Depending on how the instance is configured and how you use it, the following categories of data may be processed:

### 3.1 Account and authentication

- Email address, display name, and password **hash** (not the plain password).
- Session tokens (e.g. JWT) stored in your browser’s local storage for sign-in.
- Account status (e.g. pending approval, approved) where applicable.

### 3.2 Content you create in the app

Including, for example: group membership, group names and settings, trips, calendar events, tasks, shopping lists, links, expenses and related metadata. This data is stored in the instance’s database and is visible to other members according to the product’s design (e.g. shared within a group).

### 3.3 Technical data

- IP addresses and HTTP requests may appear in server or reverse-proxy logs, depending on how the operator configures hosting.
- Error and security logs may be retained by the operator for troubleshooting.

### 3.4 Email (optional)

If the operator enables password recovery or other email features, your email address may be used to send transactional messages through the operator’s mail provider.

### 3.5 Google Calendar (optional)

If **you** connect your Google account in the Service, the instance may store OAuth tokens (including refresh tokens) **encrypted at rest** on the server and use them to create or update events in **your** Google Calendar when you save relevant data in friendflow. Google processes data under [Google’s policies](https://policies.google.com/privacy). That integration is **one-way** from friendflow toward Google unless otherwise documented for your deployment.

---

## 4. Legal bases (EEA / UK reference)

Where the GDPR or UK GDPR applies, typical bases include **performance of a contract** (providing the Service), **legitimate interests** (security, abuse prevention, improving reliability), and, where required, **consent** (e.g. optional integrations). The operator may rely on different bases depending on configuration; contact them for specifics.

---

## 5. Storage and security

Security measures (TLS, access control, backups, encryption at rest) depend on **how the operator hosts** the instance. Passwords are stored using strong one-way hashing; other measures vary by deployment.

---

## 6. Retention

Retention periods are determined by the instance operator (for example how long logs or backups are kept). Account and content data generally remain until you delete them or the operator removes them according to their policies.

---

## 7. Sharing with third parties

- **Hosting and infrastructure** providers used by the operator may process data on their systems.
- **Google** receives data if you enable Google Calendar integration, subject to your Google account settings and Google’s terms.
- The operator should not sell your personal data as part of friendflow itself; any additional sharing depends on that operator’s practices.

---

## 8. International transfers

If servers or providers are located outside your country, transfers may occur. Mechanisms (e.g. Standard Contractual Clauses) depend on the operator’s setup.

---

## 9. Your rights

Depending on applicable law, you may have rights to access, rectify, erase, restrict processing, object, or port data, and to withdraw consent where processing is consent-based. To exercise rights, contact **the operator of the instance you use**. If you are unsure who that is, ask the person who gave you the instance URL or invite.

---

## 10. Children

The Service is not directed at children under the age where parental consent is required in your jurisdiction. The operator may restrict registration accordingly.

---

## 11. Changes

The instance operator may adopt or amend this policy for their deployment. Material changes should be communicated as they see fit (e.g. notice in the app or on their website).

---

## 12. Open source

friendflow’s source code is available under the terms of the **GNU Affero General Public License v3.0 (AGPL-3.0)**. That license governs software use and distribution; it does not replace this Privacy Policy for personal data processing.

---

## 13. Contact

For privacy requests relating to **your** account on a specific instance, contact that instance’s operator. For issues about the friendflow **software project** itself (not a particular deployment), use the contact channels published in the project repository (e.g. GitHub).
