export const enterpriseDirectory = {
  teachers: [
    {
      id: 'teacher-ava',
      email: 'ava@springfield.edu',
      name: 'Ava Bennett',
      classes: [
        {
          id: 'class-oak',
          name: 'Oak Room',
          grade: 'Year 2',
          pupils: [
            {
              id: 'pupil-luca',
              name: 'Luca Harris',
              communicationGoal: 'Expanding two-step requests',
              parentEmails: ['mia.harris@example.com'],
            },
            {
              id: 'pupil-ella',
              name: 'Ella Foster',
              communicationGoal: 'Daily routine vocabulary',
              parentEmails: ['mia.harris@example.com'],
            },
          ],
        },
        {
          id: 'class-maple',
          name: 'Maple Room',
          grade: 'Year 3',
          pupils: [
            {
              id: 'pupil-zara',
              name: 'Zara Cole',
              communicationGoal: 'Pronoun and social scripts',
              parentEmails: ['oscar.cole@example.com'],
            },
          ],
        },
      ],
    },
  ],
  parents: [
    {
      id: 'parent-mia',
      email: 'mia.harris@example.com',
      name: 'Mia Harris',
      children: [
        {
          id: 'pupil-luca',
          name: 'Luca Harris',
          className: 'Oak Room',
          communicationGoal: 'Expanding two-step requests',
          teacherName: 'Ava Bennett',
        },
        {
          id: 'pupil-ella',
          name: 'Ella Foster',
          className: 'Oak Room',
          communicationGoal: 'Daily routine vocabulary',
          teacherName: 'Ava Bennett',
        },
      ],
    },
    {
      id: 'parent-oscar',
      email: 'oscar.cole@example.com',
      name: 'Oscar Cole',
      children: [
        {
          id: 'pupil-zara',
          name: 'Zara Cole',
          className: 'Maple Room',
          communicationGoal: 'Pronoun and social scripts',
          teacherName: 'Ava Bennett',
        },
      ],
    },
  ],
}
