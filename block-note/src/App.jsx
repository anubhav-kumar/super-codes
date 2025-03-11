import { useEffect } from "react";
import "./App.css";
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";

function App() {
  // Load initial content from localStorage (if available)
  const savedContent = localStorage.getItem("editorContent");
  const initialContent = savedContent ? JSON.parse(savedContent) : undefined;
  // Creates a new editor instance.
  const editor = useCreateBlockNote({
    initialContent,
  });

  useEffect(() => {
    // Subscribe to changes
    const unsubscribe = editor.onUpdate(() => {
      const content = editor.document;
      localStorage.setItem("editorContent", JSON.stringify(content)); // Store in localStorage
      console.log("Editor Updated & Saved:", content);
    });

    // Cleanup listener when component unmounts
    return () => unsubscribe();
  }, [editor]);
  // Renders the editor instance using a React component.
  return <BlockNoteView editor={editor} />;
}

export default App;
