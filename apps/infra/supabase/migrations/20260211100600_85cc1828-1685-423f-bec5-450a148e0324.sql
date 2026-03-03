-- Transfer all projects from old user to current dev user
UPDATE projects SET user_id = '97688dfa-063b-4e25-b789-c99448665dfd' WHERE user_id = '5feb7c4f-a972-49c7-8e44-f13972ab3a18';
