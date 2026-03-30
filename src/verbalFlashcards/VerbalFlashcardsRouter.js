import { Route, Switch } from "react-router-dom";
import VerbalFlashcardsPage from "./VerbalFlashcardsPage";
import {PrivateRoute} from "@/PrivateRoute";

export default function VerbalFlashcardsRouter() {
    return (
        <Switch>
            <PrivateRoute
                path="/verbalFlashcards"
                exact
                component={VerbalFlashcardsPage}
            />
        </Switch>
    );
}