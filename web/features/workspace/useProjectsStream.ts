// web/features/workspace/useProjectsStream.ts
"use client";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/shared/firebase/client";
import { ProjectSchema, type Project } from "@/shared/types";

export function useProjectsStream(): Project[] {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      setProjects(
        snap.docs.map((doc) => ProjectSchema.parse({ id: doc.id, ...doc.data() })),
      );
    });
  }, []);

  return projects;
}
