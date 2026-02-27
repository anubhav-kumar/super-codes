defmodule LiveBettingWeb.BetLive.Form do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting
  alias LiveBetting.Betting.Bet

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        {@page_title}
        <:subtitle>Use this form to manage bet records in your database.</:subtitle>
      </.header>

      <.form for={@form} id="bet-form" phx-change="validate" phx-submit="save">
        <.input field={@form[:team_picked]} type="text" label="Team picked" />
        <.input field={@form[:amount]} type="number" label="Amount" step="any" />
        <.input field={@form[:placed_at_second]} type="number" label="Placed at second" />
        <.input field={@form[:time_weight]} type="number" label="Time weight" step="any" />
        <.input field={@form[:status]} type="text" label="Status" />
        <footer>
          <.button phx-disable-with="Saving..." variant="primary">Save Bet</.button>
          <.button navigate={return_path(@return_to, @bet)}>Cancel</.button>
        </footer>
      </.form>
    </Layouts.app>
    """
  end

  @impl true
  def mount(params, _session, socket) do
    {:ok,
     socket
     |> assign(:return_to, return_to(params["return_to"]))
     |> apply_action(socket.assigns.live_action, params)}
  end

  defp return_to("show"), do: "show"
  defp return_to(_), do: "index"

  defp apply_action(socket, :edit, %{"id" => id}) do
    bet = Betting.get_bet!(id)

    socket
    |> assign(:page_title, "Edit Bet")
    |> assign(:bet, bet)
    |> assign(:form, to_form(Betting.change_bet(bet)))
  end

  defp apply_action(socket, :new, _params) do
    bet = %Bet{}

    socket
    |> assign(:page_title, "New Bet")
    |> assign(:bet, bet)
    |> assign(:form, to_form(Betting.change_bet(bet)))
  end

  @impl true
  def handle_event("validate", %{"bet" => bet_params}, socket) do
    changeset = Betting.change_bet(socket.assigns.bet, bet_params)
    {:noreply, assign(socket, form: to_form(changeset, action: :validate))}
  end

  def handle_event("save", %{"bet" => bet_params}, socket) do
    save_bet(socket, socket.assigns.live_action, bet_params)
  end

  defp save_bet(socket, :edit, bet_params) do
    case Betting.update_bet(socket.assigns.bet, bet_params) do
      {:ok, bet} ->
        {:noreply,
         socket
         |> put_flash(:info, "Bet updated successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, bet))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp save_bet(socket, :new, bet_params) do
    case Betting.create_bet(bet_params) do
      {:ok, bet} ->
        {:noreply,
         socket
         |> put_flash(:info, "Bet created successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, bet))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp return_path("index", _bet), do: ~p"/bets"
  defp return_path("show", bet), do: ~p"/bets/#{bet}"
end
