/**
 * Parseur Markdown ultra-léger et sécurisé (Zero Dependency)
 * Supporte : titres, listes, code blocks, tableaux, liens, citations GitHub Alerts.
 */
export function renderMarkdown(md) {
	if (!md) return "";

	let html = md
		// Échappement de base des balises brutes
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

	// GitHub Alerts: > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]
	html = html.replace(
		/^&gt;\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/gim,
		(_, type, content) => {
			const t = type.toLowerCase();
			const icons = {
				note: "ℹ️",
				tip: "💡",
				important: "📌",
				warning: "⚠️",
				caution: "🛑",
			};
			return `<div class="alert alert-${t}" style="border-left: 4px solid var(--accent-indigo); padding: 8px 12px; margin: 8px 0; background: rgba(99, 102, 241, 0.1); border-radius: 4px;"><strong>${icons[t] || "ℹ️"} ${type}:</strong> ${content}</div>`;
		},
	);

	// Citations ordinaires
	html = html.replace(
		/^&gt;\s+(.*)$/gim,
		'<blockquote style="border-left: 3px solid var(--border-color); padding-left: 10px; color: var(--text-muted); margin: 6px 0;">$1</blockquote>',
	);

	// Code blocks avec langage
	html = html.replace(
		/```([a-zA-Z0-9_\-.+]*)\n([\s\S]*?)```/gm,
		(_, lang, code) => {
			return `<pre style="background: #050811; border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 10px 0;"><code class="language-${lang}">${code}</code></pre>`;
		},
	);

	// Inline code
	html = html.replace(
		/`([^`]+)`/g,
		'<code style="background: rgba(99, 102, 241, 0.15); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.85em;">$1</code>',
	);

	// Titres H1 - H4
	html = html.replace(
		/^#### (.*$)/gim,
		'<h4 style="margin: 12px 0 6px; color: var(--text-main); font-size: 0.95rem;">$1</h4>',
	);
	html = html.replace(
		/^### (.*$)/gim,
		'<h3 style="margin: 14px 0 6px; color: #a5b4fc; font-size: 1.1rem;">$1</h3>',
	);
	html = html.replace(
		/^## (.*$)/gim,
		'<h2 style="margin: 18px 0 8px; color: #818cf8; font-size: 1.25rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px;">$1</h2>',
	);
	html = html.replace(
		/^# (.*$)/gim,
		'<h1 style="margin: 20px 0 10px; color: #fff; font-size: 1.45rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px;">$1</h1>',
	);

	// Gras et Italique
	html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

	// Liens
	html = html.replace(
		/\[([^\]]+)\]\(([^)]+)\)/g,
		'<a href="$2" target="_blank" rel="noopener" style="color: var(--accent-blue); text-decoration: underline;">$1</a>',
	);

	// Lignes horizontales
	html = html.replace(
		/^---$/gm,
		'<hr style="border: 0; border-top: 1px solid var(--border-subtle); margin: 16px 0;">',
	);

	// Listes à puces
	html = html.replace(
		/^\s*[-*]\s+(.*)$/gim,
		'<li style="margin-left: 20px;">$1</li>',
	);

	// Tableaux simples
	const lines = html.split("\n");
	let inTable = false;
	const tableHtml = [];
	const processedLines = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.startsWith("|") && line.endsWith("|")) {
			if (line.includes("---")) {
				continue;
			}
			const cells = line
				.split("|")
				.slice(1, -1)
				.map((c) => c.trim());
			if (!inTable) {
				inTable = true;
				tableHtml.push(
					'<div style="overflow-x:auto; margin: 12px 0;"><table style="width:100%; border-collapse: collapse; font-size: 0.85rem;"><thead><tr>',
				);
				for (const c of cells) {
					tableHtml.push(
						`<th style="border: 1px solid var(--border-color); padding: 8px 10px; background: var(--bg-tertiary); text-align: left;">${c}</th>`,
					);
				}
				tableHtml.push("</tr></thead><tbody>");
			} else {
				tableHtml.push("<tr>");
				for (const c of cells) {
					tableHtml.push(
						`<td style="border: 1px solid var(--border-color); padding: 7px 10px;">${c}</td>`,
					);
				}
				tableHtml.push("</tr>");
			}
		} else {
			if (inTable) {
				inTable = false;
				tableHtml.push("</tbody></table></div>");
				processedLines.push(tableHtml.join(""));
				tableHtml.length = 0;
			}
			processedLines.push(lines[i]);
		}
	}
	if (inTable) {
		tableHtml.push("</tbody></table></div>");
		processedLines.push(tableHtml.join(""));
	}

	html = processedLines.join("\n").replace(/\n\n+/g, "<br><br>");
	return html;
}
