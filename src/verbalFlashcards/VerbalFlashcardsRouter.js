import { Route, Switch } from "react-router-dom";
import VerbalFlashcardsPage from "./VerbalFlashcardsPage";
import { PrivateRoute } from "@/PrivateRoute";
import Congratulations from "../exercises/Congratulations";
import { useContext } from "react";
import { APIContext } from "../contexts/APIContext";

export default function VerbalFlashcardsRouter() {
    const api = useContext(APIContext);

    const backToVerbalFlashcards = ({ history }) => {
        history.push('/verbalFlashcards');
        api.logUserActivity(api.KEEP_EXERCISING, "", "", "verbal_flashcards");
    };

    return (
        <Switch>
            <Route
                path="/verbalFlashcards/summary"
                render={(props) => (
                    <Congratulations
                        {...props}
                        backButtonAction={() => backToVerbalFlashcards(props)}
                        keepExercisingAction={() => backToVerbalFlashcards(props)}
                        toScheduledExercises={() => backToVerbalFlashcards(props)}
                    />
                )}
            />
            <PrivateRoute
                path="/verbalFlashcards"
                exact
                component={VerbalFlashcardsPage}
            />
        </Switch>
    );
}
