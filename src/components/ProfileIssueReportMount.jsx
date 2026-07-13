import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import IssueReportForm from "./IssueReportForm";
import BlockedUsersSection from "./BlockedUsersSection";
import AccountDataExportSection from "./AccountDataExportSection";
import AccountDeletionSection from "./AccountDeletionSection";
import ProfileAgeRequirementGuard from "./ProfileAgeRequirementGuard";
import "./ProfileLegalSection.css";

const MOUNT_ID = "burgrs-issue-report-mount";

export default function ProfileIssueReportMount() {
  const [mountNode, setMountNode] = useState(null);

  useEffect(() => {
    let frameId = 0;

    function findOrCreateMount() {
      const profilePage = document.querySelector(".profile-edit-page");
      const profileForm = profilePage?.querySelector("form");

      if (!profilePage || !profileForm) {
        setMountNode(null);
        return;
      }

      let node = document.getElementById(MOUNT_ID);
      if (!node) {
        node = document.createElement("div");
        node.id = MOUNT_ID;
        node.className = "profile-issue-report-mount";
        profileForm.insertAdjacentElement("afterend", node);
      }

      setMountNode(node);
    }

    function scheduleCheck() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(findOrCreateMount);
    }

    scheduleCheck();

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", scheduleCheck);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("popstate", scheduleCheck);
      document.getElementById(MOUNT_ID)?.remove();
      setMountNode(null);
    };
  }, []);

  return (
    <>
      <ProfileAgeRequirementGuard />
      {mountNode
        ? createPortal(
            <>
              <IssueReportForm />
              <BlockedUsersSection />
              <section className="profile-legal-section" aria-labelledby="profile-legal-title">
                <div className="profile-legal-copy">
                  <h2 id="profile-legal-title">Legal</h2>
                  <p>Read the policies and rules that apply when using BURGRS.</p>
                </div>
                <div className="profile-legal-links">
                  <a href="/privacy/">Privacy Policy</a>
                  <a href="/terms/">Terms of Use</a>
                  <a href="/community-guidelines/">Community Guidelines</a>
                  <a href="/age-and-children/">Age &amp; Children</a>
                </div>
              </section>
              <AccountDataExportSection />
              <AccountDeletionSection />
            </>,
            mountNode
          )
        : null}
    </>
  );
}
