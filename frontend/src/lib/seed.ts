import type { Database, Project, RecruitmentRole, Student } from "./models";
export const CURRENT_STUDENT_ID = "student-maya";
const skillNames = [
  "C++",
  "React",
  "FastAPI",
  "PostgreSQL",
  "Docker",
  "Git",
  "Python",
  "Tailwind CSS",
  "OpenCV",
  "PyTorch",
  "YOLOv8",
  "TypeScript",
  "Firebase",
  "Figma",
  "ESP32",
  "MQTT",
  "Node.js",
  "Next.js",
  "Prisma",
  "GraphQL",
  "ROS2",
  "SLAM",
  "Linux",
  "React Native",
  "Expo",
  "Express",
  "Technical Writing",
  "FreeRTOS",
];
export const catalog = skillNames.map((name) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
  name,
}));
const ids = (...names: string[]) =>
  names.map((name) => catalog.find((s) => s.name === name)!.id);
function student(
  id: string,
  name: string,
  campus: string,
  department = "Computer Science & Engineering",
): Student {
  return {
    id,
    name,
    campus,
    department,
    semester: "5",
    bio: "Student builder interested in useful campus tools, thoughtful design, and collaborative engineering.",
    email: `${id}@example.com`,
    skillIds: ids("React", "Python"),
    github: "",
    linkedin: "",
    website: "",
  };
}
const students: Student[] = [
  {
    ...student(CURRENT_STUDENT_ID, "Maya Rao", "NIT Raipur"),
    bio: "Passionate about backend systems, REST APIs, and full-stack web tools. Looking to collaborate on thoughtful university and civic technology projects.",
    skillIds: ids(
      "C++",
      "React",
      "FastAPI",
      "PostgreSQL",
      "Docker",
      "Git",
      "Python",
      "Tailwind CSS",
    ),
  },
  student("aarav", "Aarav Sharma", "NIT Raipur"),
  student("sneha", "Sneha Patel", "IIT Delhi", "Electrical Engineering"),
  student("vikram", "Vikram Verma", "BITS Pilani", "Mechanical Engineering"),
  student("rohan", "Rohan Mehta", "NIT Trichy"),
  student("priya", "Priya Sundaram", "IIT Madras", "Robotics"),
  student("kabir", "Kabir Das", "SRM University"),
  student("ananya", "Ananya Roy", "NIT Raipur"),
  student("dev", "Dev Shah", "NIT Raipur", "Electronics Engineering"),
];
const projects: Project[] = [
  {
    id: "smart-traffic",
    title: "Smart Traffic Management: Real-Time Green Corridor System",
    summary:
      "Reducing emergency vehicle delays with adaptive traffic signals and roadside sensing.",
    description:
      "Emergency vehicles lose valuable time at congested intersections. Our student team is exploring a coordinated green corridor that adjusts signal timings as an emergency vehicle approaches. We are building a small, measurable campus testbed with a live telemetry dashboard and a hardware prototype.",
    type: "Hackathon",
    tag: "Campus Innovation Challenge 2026",
    campus: "NIT Raipur",
    ownerId: "aarav",
    capacity: 5,
    recruitment: "open",
    createdAt: "2026-09-28",
    deadline: "2026-11-18",
    skillIds: ids("Python", "YOLOv8", "FastAPI", "OpenCV", "Docker"),
    deliverables: [
      {
        title: "Roadside vehicle sensing",
        description:
          "Measure queue density using recorded traffic footage and compare detection results.",
      },
      {
        title: "Priority beacon ingest",
        description:
          "Prototype a reliable signal from an approaching emergency vehicle.",
      },
      {
        title: "Municipal API pipeline",
        description:
          "Design a clear, testable interface for incoming traffic observations.",
      },
      {
        title: "Real-time transit telemetry",
        description:
          "Build an accessible dashboard to inspect the testbed and its signal states.",
      },
    ],
  },
  {
    id: "lost-and-found",
    title: "Campus Lost & Found",
    summary:
      "A campus web app connecting students to report lost items and reunite them with their owners.",
    description:
      "Help students find their belongings without endless group messages. We are building a searchable lost-and-found board with clear item descriptions and a simple claim workflow.",
    type: "Personal Project",
    tag: "Web PWA",
    campus: "IIT Delhi",
    ownerId: "sneha",
    capacity: 4,
    recruitment: "open",
    createdAt: "2026-09-26",
    skillIds: ids("React", "Tailwind CSS", "Firebase", "TypeScript"),
    deliverables: [
      {
        title: "Accessible item directory",
        description: "Create responsive browsing and item details.",
      },
      {
        title: "Clear reporting flow",
        description: "Design an approachable form for lost and found items.",
      },
    ],
  },
  {
    id: "autooxy",
    title: "AutoOxy — Low-Cost Respirator Testbed",
    summary:
      "An educational pneumatic prototype with a telemetry dashboard for laboratory experiments.",
    description:
      "Explore embedded telemetry and control systems in an educational lab prototype. This is a learning project and is not intended for clinical use.",
    type: "Hardware & Embedded",
    tag: "Engineering Lab",
    campus: "BITS Pilani",
    ownerId: "vikram",
    capacity: 6,
    recruitment: "open",
    createdAt: "2026-09-24",
    skillIds: ids("C++", "FreeRTOS", "ESP32", "MQTT", "Node.js"),
    deliverables: [
      {
        title: "Sensor integration",
        description:
          "Read and inspect pressure signals in a controlled laboratory setting.",
      },
      {
        title: "Telemetry dashboard",
        description: "Display sensor readings with clear units and timestamps.",
      },
    ],
  },
  {
    id: "study-planner",
    title: "Open Source Study Planner",
    summary:
      "A modular academic planner for syllabus tracking, study sessions, and shared learning resources.",
    description:
      "Build an open source study companion with students across campuses. Focus on a small, accessible planner and documentation that makes it easy for new contributors to participate.",
    type: "Open Source",
    tag: "MIT License",
    campus: "NIT Trichy",
    ownerId: "rohan",
    capacity: 5,
    recruitment: "open",
    createdAt: "2026-09-22",
    skillIds: ids("Next.js", "React", "PostgreSQL", "Prisma", "GraphQL"),
    deliverables: [
      {
        title: "Course planning",
        description: "Create a clear view of subjects and study goals.",
      },
      {
        title: "Contributor documentation",
        description: "Write practical setup and usage guides.",
      },
    ],
  },
  {
    id: "campus-rover",
    title: "Autonomous Campus Delivery Rover",
    summary:
      "A LiDAR-based campus delivery robot prototype for navigating student parcel routes.",
    description:
      "Our robotics group is testing navigation in a controlled campus environment. The current team is complete and recruitment is closed while we evaluate the prototype.",
    type: "Research Project",
    tag: "Robotics Lab",
    campus: "IIT Madras",
    ownerId: "priya",
    capacity: 3,
    recruitment: "closed",
    createdAt: "2026-09-20",
    skillIds: ids("ROS2", "C++", "Python", "SLAM", "Linux"),
    deliverables: [
      {
        title: "Mapping testbed",
        description: "Evaluate repeatable indoor routes.",
      },
      {
        title: "Navigation evaluation",
        description: "Document obstacles and stopping behavior.",
      },
    ],
  },
  {
    id: "finlit",
    title: "FinLit for Students",
    summary:
      "A budgeting and financial literacy simulator designed around everyday student life.",
    description:
      "Make financial literacy approachable through fictional budgets and guided exercises. Help us design a mobile experience for learning about spending and saving.",
    type: "Startup Prototype",
    tag: "Student Finance",
    campus: "SRM University",
    ownerId: "kabir",
    capacity: 4,
    recruitment: "open",
    createdAt: "2026-09-18",
    skillIds: ids("React Native", "React", "Expo", "Node.js", "Express"),
    deliverables: [
      {
        title: "Budget simulator",
        description: "Build interactive exercises with fictional money.",
      },
      {
        title: "Mobile learning flow",
        description: "Create clear, accessible screens for short lessons.",
      },
    ],
  },
];
function role(
  id: string,
  projectId: string,
  title: string,
  category: string,
  positions: number,
  names: string[],
  description: string,
): RecruitmentRole {
  return {
    id,
    projectId,
    title,
    category,
    positions,
    skillIds: ids(...names),
    description,
  };
}
const roles = [
  role(
    "traffic-backend",
    "smart-traffic",
    "Backend & Systems Developer",
    "Backend",
    1,
    ["Python", "FastAPI", "Docker", "PostgreSQL"],
    "Build the data ingest interface and connect roadside observations with the telemetry dashboard.",
  ),
  role(
    "traffic-vision",
    "smart-traffic",
    "Computer Vision Engineer",
    "Computer Vision",
    1,
    ["Python", "PyTorch", "OpenCV", "YOLOv8"],
    "Evaluate vehicle detection on recorded footage and document performance on the testbed.",
  ),
  role(
    "traffic-frontend",
    "smart-traffic",
    "Frontend Engineer",
    "Frontend",
    1,
    ["React", "TypeScript"],
    "Build the traffic telemetry interface.",
  ),
  role(
    "lost-frontend",
    "lost-and-found",
    "Frontend Developer",
    "Frontend",
    1,
    ["React", "TypeScript"],
    "Build responsive item discovery and reporting screens.",
  ),
  role(
    "lost-design",
    "lost-and-found",
    "UI/UX Designer",
    "Design",
    1,
    ["Figma"],
    "Design a welcoming and accessible item reporting experience.",
  ),
  role(
    "oxy-embedded",
    "autooxy",
    "Embedded Developer",
    "Embedded",
    1,
    ["C++", "ESP32"],
    "Connect laboratory sensors and document their readings.",
  ),
  role(
    "oxy-backend",
    "autooxy",
    "Backend Engineer",
    "Backend",
    1,
    ["Node.js", "MQTT"],
    "Build a clear interface for telemetry events.",
  ),
  role(
    "study-fullstack",
    "study-planner",
    "Full-stack Developer",
    "Full-stack",
    2,
    ["Next.js", "PostgreSQL"],
    "Build accessible planning screens and data interfaces.",
  ),
  role(
    "study-writer",
    "study-planner",
    "Technical Writer",
    "Writing",
    1,
    ["Technical Writing", "Git"],
    "Help new contributors get started with clear documentation.",
  ),
  role(
    "rover-robotics",
    "campus-rover",
    "Robotics Specialist",
    "Robotics",
    1,
    ["ROS2", "SLAM"],
    "Evaluate navigation in the controlled test environment.",
  ),
  role(
    "finlit-mobile",
    "finlit",
    "React Native Developer",
    "Mobile",
    1,
    ["React Native", "Expo"],
    "Create approachable budgeting exercises for mobile devices.",
  ),
];
const teamEntries: [string, string, string, string?][] = [
  ["smart-traffic", "aarav", "Systems lead"],
  ["smart-traffic", "ananya", "Frontend & telemetry", "traffic-frontend"],
  ["smart-traffic", "dev", "Embedded hardware"],
  ["lost-and-found", "sneha", "Product lead"],
  ["lost-and-found", CURRENT_STUDENT_ID, "Backend developer"],
  ["autooxy", "vikram", "Hardware lead"],
  ["autooxy", "dev", "Sensor integration"],
  ["autooxy", "ananya", "Dashboard"],
  ["autooxy", "aarav", "Laboratory testing"],
  ["study-planner", "rohan", "Project lead"],
  ["study-planner", CURRENT_STUDENT_ID, "Contributor"],
  ["campus-rover", "priya", "Robotics lead"],
  ["campus-rover", "dev", "Navigation", "rover-robotics"],
  ["campus-rover", "rohan", "Hardware"],
  ["finlit", "kabir", "Product lead"],
  ["finlit", "sneha", "Design"],
  ["finlit", "ananya", "Content"],
];
export function createSeed(): Database {
  return structuredClone({
    drafts: [],
    students,
    skills: catalog,
    projects,
    roles,
    memberships: teamEntries.map(
      ([projectId, studentId, contribution, roleId], i) => ({
        id: `member-${i}`,
        projectId,
        studentId,
        contribution,
        roleId,
      }),
    ),
    applications: [],
  });
}
